use serde_json::Value;
use std::env;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, thiserror::Error)]
pub enum Pm2Error {
    #[error("pm2 not found")]
    NotFound,
    #[error("command failed: {0}")]
    CommandFailed(String),
    #[error("failed to parse pm2 output: {0}")]
    ParseError(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Pm2ProcessStatus {
    Online,
    Launching,
    Stopping,
    Stopped,
    Errored,
    Missing,
    Unknown,
}

/// Locate the `pm2.cmd` binary using the resolver described in the architecture.
pub fn resolve() -> Result<PathBuf, Pm2Error> {
    if let Ok(override_path) = env::var("TRAY_PM2_PATH") {
        let path = PathBuf::from(override_path);
        if path.exists() {
            return Ok(path);
        }
    }

    if let Some(path) = find_where_pm2() {
        return Ok(path);
    }

    if let Some(path) = common_pm2_paths().into_iter().find(|p| p.exists()) {
        return Ok(path);
    }

    if let Some(path) = npm_prefix_pm2() {
        if path.exists() {
            return Ok(path);
        }
    }

    if let Some(path) = node_pm2_paths().into_iter().find(|p| p.exists()) {
        return Ok(path);
    }

    Err(Pm2Error::NotFound)
}

fn find_where_pm2() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = std::process::Command::new("cmd")
            .args(["/C", "where", "pm2"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.ends_with(".cmd") || trimmed.ends_with(".bat") {
                return Some(PathBuf::from(trimmed));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("which")
            .arg("pm2")
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    None
}

fn common_pm2_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(appdata) = env::var("APPDATA") {
        paths.push(PathBuf::from(appdata).join("npm").join("pm2.cmd"));
    }
    if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
        paths.push(PathBuf::from(local_appdata).join("npm").join("pm2.cmd"));
    }
    paths
}

fn npm_prefix_pm2() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = std::process::Command::new("cmd")
            .args(["/C", "npm", "config", "get", "prefix"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if prefix.is_empty() {
            return None;
        }
        Some(PathBuf::from(prefix).join("pm2.cmd"))
    }
    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("npm")
            .args(["config", "get", "prefix"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if prefix.is_empty() {
            return None;
        }
        Some(PathBuf::from(prefix).join("bin").join("pm2"))
    }
}

fn node_pm2_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(program_files) = env::var("ProgramFiles") {
        paths.push(PathBuf::from(program_files).join("nodejs").join("pm2.cmd"));
    }
    if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
        paths.push(PathBuf::from(program_files_x86).join("nodejs").join("pm2.cmd"));
    }
    paths
}

/// Run `pm2 startOrRestart <config>` using absolute paths and structured arguments.
pub async fn start_or_restart(pm2_path: &Path, gateway_home: &Path) -> Result<(), Pm2Error> {
    let config = gateway_home
        .canonicalize()
        .unwrap_or_else(|_| gateway_home.to_path_buf())
        .join("pm2.config.json");
    if !config.exists() {
        return Err(Pm2Error::CommandFailed(format!(
            "pm2.config.json not found at {}",
            config.display()
        )));
    }
    run(pm2_path, &["startOrRestart", config.to_str().unwrap_or("")]).await?;
    Ok(())
}

/// Run `pm2 stop <name>`.
pub async fn stop(pm2_path: &Path, name: &str) -> Result<(), Pm2Error> {
    run(pm2_path, &["stop", name]).await?;
    Ok(())
}

/// Run `pm2 jlist` and locate the named process.
pub async fn jlist_status(pm2_path: &Path, name: &str) -> Result<Pm2ProcessStatus, Pm2Error> {
    let output = run(pm2_path, &["jlist"]).await?;
    let json: Vec<Value> =
        serde_json::from_slice(&output.stdout).map_err(|e| Pm2Error::ParseError(e.to_string()))?;

    for proc in json {
        let proc_name = proc.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if proc_name != name {
            continue;
        }
        let status = proc
            .get("pm2_env")
            .and_then(|v| v.get("status"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Ok(map_status(status));
    }

    Ok(Pm2ProcessStatus::Missing)
}

async fn run(pm2_path: &Path, args: &[&str]) -> Result<std::process::Output, Pm2Error> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("cmd")
            .arg("/C")
            .arg(pm2_path)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .map_err(|e| Pm2Error::CommandFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let message = if stderr.is_empty() { stdout } else { stderr };
            return Err(Pm2Error::CommandFailed(message));
        }

        Ok(output)
    }
    #[cfg(not(windows))]
    {
        let output = Command::new(pm2_path)
            .args(args)
            .output()
            .await
            .map_err(|e| Pm2Error::CommandFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let message = if stderr.is_empty() { stdout } else { stderr };
            return Err(Pm2Error::CommandFailed(message));
        }

        Ok(output)
    }
}

fn map_status(status: &str) -> Pm2ProcessStatus {
    match status {
        "online" => Pm2ProcessStatus::Online,
        "launching" | "one-launch-status" => Pm2ProcessStatus::Launching,
        "stopping" => Pm2ProcessStatus::Stopping,
        "stopped" => Pm2ProcessStatus::Stopped,
        "errored" => Pm2ProcessStatus::Errored,
        _ => Pm2ProcessStatus::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_pm2_statuses() {
        assert_eq!(map_status("online"), Pm2ProcessStatus::Online);
        assert_eq!(map_status("launching"), Pm2ProcessStatus::Launching);
        assert_eq!(map_status("one-launch-status"), Pm2ProcessStatus::Launching);
        assert_eq!(map_status("stopping"), Pm2ProcessStatus::Stopping);
        assert_eq!(map_status("stopped"), Pm2ProcessStatus::Stopped);
        assert_eq!(map_status("errored"), Pm2ProcessStatus::Errored);
        assert_eq!(map_status("unknown"), Pm2ProcessStatus::Unknown);
    }
}
