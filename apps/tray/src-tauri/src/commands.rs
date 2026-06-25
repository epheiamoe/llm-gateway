use std::env;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::state::{AppState, TrayState};
use crate::{health, pm2, window};

#[tauri::command]
pub async fn get_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    Ok(serde_json::json!({
        "state": state.current(),
        "message": state.message(),
    }))
}

#[tauri::command]
pub async fn start_service(app: AppHandle) -> Result<(), String> {
    run_start(app).await
}

#[tauri::command]
pub async fn stop_service(app: AppHandle) -> Result<(), String> {
    let pm2_path = {
        let state = app.state::<AppState>();
        let guard = state.pm2_path.lock().unwrap();
        guard.clone()
    }
    .ok_or("pm2 not found")?;

    {
        let state = app.state::<AppState>();
        state.set(
            &app,
            TrayState::Stopping,
            Some("Stopping service...".into()),
        );
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        if let Err(e) = pm2::stop(&pm2_path, "llm-gateway").await {
            state.set(&app, TrayState::Error, Some(e.to_string()));
            state.emit_error(&app, "stop", &e.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn restart_service(app: AppHandle) -> Result<(), String> {
    let (gateway_home, pm2_path) = {
        let state = app.state::<AppState>();
        let guard = state.pm2_path.lock().unwrap();
        (state.gateway_home.clone(), guard.clone())
    };
    let pm2_path = pm2_path.ok_or("pm2 not found")?;

    {
        let state = app.state::<AppState>();
        state.set(
            &app,
            TrayState::Starting,
            Some("Restarting service...".into()),
        );
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();

        if let Err(e) = ensure_build(&gateway_home).await {
            let msg = format!("Build failed: {}", e);
            state.set(&app, TrayState::Error, Some(msg.clone()));
            state.emit_error(&app, "restart", &msg);
            return;
        }

        if let Err(e) = pm2::stop(&pm2_path, "llm-gateway").await {
            state.set(&app, TrayState::Error, Some(e.to_string()));
            state.emit_error(&app, "restart", &e.to_string());
            return;
        }

        tokio::time::sleep(Duration::from_millis(500)).await;

        if let Err(e) = pm2::start_or_restart(&pm2_path, &gateway_home).await {
            state.set(&app, TrayState::Error, Some(e.to_string()));
            state.emit_error(&app, "restart", &e.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn open_dashboard(app: AppHandle) -> Result<(), String> {
    {
        let state = app.state::<AppState>();
        if state.current() == TrayState::Running {
            window::open_dashboard_window(&app);
            return Ok(());
        }
    }

    let (gateway_home, pm2_path) = {
        let state = app.state::<AppState>();
        let guard = state.pm2_path.lock().unwrap();
        (state.gateway_home.clone(), guard.clone())
    };
    let pm2_path = pm2_path.ok_or("pm2 not found")?;

    {
        let state = app.state::<AppState>();
        state.set(
            &app,
            TrayState::Starting,
            Some("Starting service before opening dashboard...".into()),
        );
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();

        if let Err(e) = ensure_build(&gateway_home).await {
            let msg = format!("Build failed: {}", e);
            state.set(&app, TrayState::Error, Some(msg));
            return;
        }

        if let Err(e) = pm2::start_or_restart(&pm2_path, &gateway_home).await {
            state.set(&app, TrayState::Error, Some(e.to_string()));
            state.emit_error(&app, "open_dashboard", &e.to_string());
            return;
        }

        // Wait up to 90 seconds for the service to become healthy.
        for _ in 0..90 {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if matches!(
                health::poll(
                    &gateway_home,
                    Some(pm2_path.as_path())).await,
                health::ServiceState::Running
            ) {
                window::open_dashboard_window(&app);
                return;
            }
        }

        state.set(
            &app,
            TrayState::Error,
            Some("Timed out waiting for the dashboard to become available".into()),
        );
    });

    Ok(())
}

#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    Ok(crate::autostart::is_enabled(&app))
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    crate::autostart::set_enabled(&app, enabled)?;
    crate::tray::update(&app);
    Ok(())
}

async fn run_start(app: AppHandle) -> Result<(), String> {
    let (gateway_home, pm2_path) = {
        let state = app.state::<AppState>();
        let guard = state.pm2_path.lock().unwrap();
        (state.gateway_home.clone(), guard.clone())
    };
    let config_path = gateway_home.join("pm2.config.json");
    if !config_path.exists() {
        return Err(format!(
            "pm2.config.json not found at {}",
            config_path.display()
        ));
    }
    let pm2_path = pm2_path.ok_or("pm2 not found")?;

    {
        let state = app.state::<AppState>();
        state.set(&app, TrayState::Starting, Some("Starting service...".into()));
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();

        if let Err(e) = ensure_build(&gateway_home).await {
            let msg = format!("Build failed: {}", e);
            state.set(&app, TrayState::Error, Some(msg.clone()));
            state.emit_error(&app, "start", &msg);
            return;
        }

        if let Err(e) = pm2::start_or_restart(&pm2_path, &gateway_home).await {
            state.set(&app, TrayState::Error, Some(e.to_string()));
            state.emit_error(&app, "start", &e.to_string());
        }
    });

    Ok(())
}

async fn ensure_build(gateway_home: &PathBuf) -> Result<(), String> {
    if gateway_home.join(".next").join("BUILD_ID").exists() {
        return Ok(());
    }

    let npm_path = resolve_npm().ok_or("npm not found; cannot build gateway")?;
    let output = tokio::process::Command::new("cmd")
        .arg("/C")
        .arg(npm_path)
        .arg("run")
        .arg("build")
        .current_dir(gateway_home)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if stderr.is_empty() {
            stdout.to_string()
        } else {
            stderr.to_string()
        };
        Err(message)
    }
}

fn resolve_npm() -> Option<PathBuf> {
    if let Ok(override_path) = env::var("TRAY_NPM_PATH") {
        let path = PathBuf::from(override_path);
        if path.exists() {
            return Some(path);
        }
    }

    let output = std::process::Command::new("cmd")
        .args(["/C", "where", "npm"])
        .output()
        .ok()?;
    if output.status.success() {
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

    let mut candidates = Vec::new();
    if let Ok(appdata) = env::var("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("npm").join("npm.cmd"));
    }
    if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local_appdata).join("npm").join("npm.cmd"));
    }
    if let Ok(program_files) = env::var("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs").join("npm.cmd"));
    }
    if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(program_files_x86).join("nodejs").join("npm.cmd"));
    }

    candidates.into_iter().find(|p| p.exists())
}
