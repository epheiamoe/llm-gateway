use std::env;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const FALLBACK_GATEWAY_HOME: &str = r"E:\Epheia\dev\dev_tool\llm-gateway";

/// Resolves the gateway repository root using this precedence:
/// 1. `LLM_GATEWAY_HOME` environment variable.
/// 2. `%APPDATA%\llm-gateway-tray\config.json` → `gateway_home`.
/// 3. Built-in fallback path.
///
/// The selected directory is accepted only if it contains `pm2.config.json`.
pub fn resolve_gateway_home(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(home) = env::var("LLM_GATEWAY_HOME") {
        let path = PathBuf::from(home);
        if has_gateway_marker(&path) {
            return Ok(path);
        }
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
    let config_path = app_data.join("config.json");
    if config_path.exists() {
        if let Ok(text) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(home) = json.get("gateway_home").and_then(|v| v.as_str()) {
                    let path = PathBuf::from(home);
                    if has_gateway_marker(&path) {
                        return Ok(path);
                    }
                }
            }
        }
    }

    let fallback = PathBuf::from(FALLBACK_GATEWAY_HOME);
    if has_gateway_marker(&fallback) {
        return Ok(fallback);
    }

    Err(format!(
        "gateway home not found. Set LLM_GATEWAY_HOME or create {} with a gateway_home field",
        config_path.display()
    ))
}

pub fn has_gateway_marker(path: &Path) -> bool {
    path.is_dir() && path.join("pm2.config.json").exists()
}
