use std::path::Path;
use std::time::Duration;

use serde_json::Value;

use crate::pm2::{self, Pm2Error, Pm2ProcessStatus};

#[derive(Debug, Clone, serde::Serialize)]
pub enum ServiceState {
    Running,
    Starting,
    Stopped,
    Error { message: String },
    Pm2Missing,
}

/// Poll the gateway health endpoint, falling back to `pm2 jlist` when health is unreachable.
/// If the health check fails but pm2 reports the process is online/launching, treat it as
/// Starting rather than Error to avoid flashing red while the gateway is still booting.
pub async fn poll(_gateway_home: &Path, pm2_path: Option<&Path>) -> ServiceState {
    let client = reqwest::Client::new();
    match client
        .get("http://127.0.0.1:3456/api/health")
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
            Ok(json) => {
                if json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
                    ServiceState::Running
                } else {
                    ServiceState::Error {
                        message: "health body missing ok: true".into(),
                    }
                }
            }
            Err(e) => ServiceState::Error {
                message: format!("failed to parse health response: {}", e),
            },
        },
        Ok(resp) => {
            // Non-2xx from /api/health. The gateway process may be up but not ready yet.
            let status = resp.status();
            match pm2_path {
                Some(path) => match pm2::jlist_status(path, "llm-gateway").await {
                    Ok(Pm2ProcessStatus::Online) | Ok(Pm2ProcessStatus::Launching) => {
                        ServiceState::Starting
                    }
                    Ok(Pm2ProcessStatus::Stopping)
                    | Ok(Pm2ProcessStatus::Stopped)
                    | Ok(Pm2ProcessStatus::Missing) => ServiceState::Stopped,
                    Ok(Pm2ProcessStatus::Errored) => ServiceState::Error {
                        message: "pm2 process is in errored state".into(),
                    },
                    Ok(Pm2ProcessStatus::Unknown) => ServiceState::Error {
                        message: format!("health returned {} and pm2 status unknown", status),
                    },
                    Err(_) => ServiceState::Error {
                        message: format!("health returned {}", status),
                    },
                },
                None => ServiceState::Pm2Missing,
            }
        }
        Err(_) => match pm2_path {
            Some(path) => classify_pm2(path).await,
            None => ServiceState::Pm2Missing,
        },
    }
}

async fn classify_pm2(pm2_path: &Path) -> ServiceState {
    match pm2::jlist_status(pm2_path, "llm-gateway").await {
        Ok(Pm2ProcessStatus::Online) => ServiceState::Starting,
        Ok(Pm2ProcessStatus::Launching) => ServiceState::Starting,
        Ok(Pm2ProcessStatus::Stopping)
        | Ok(Pm2ProcessStatus::Stopped)
        | Ok(Pm2ProcessStatus::Missing) => ServiceState::Stopped,
        Ok(Pm2ProcessStatus::Errored) => ServiceState::Error {
            message: "pm2 process is in errored state".into(),
        },
        Ok(Pm2ProcessStatus::Unknown) => ServiceState::Error {
            message: "pm2 returned an unrecognized status".into(),
        },
        Err(Pm2Error::NotFound) => ServiceState::Pm2Missing,
        Err(e) => ServiceState::Error {
            message: format!("pm2 status check failed: {}", e),
        },
    }
}
