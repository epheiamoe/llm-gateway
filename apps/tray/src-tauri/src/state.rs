use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrayState {
    Stopped,
    Starting,
    Stopping,
    Running,
    Error,
    Pm2Missing,
}

impl TrayState {
    pub fn label(&self) -> &'static str {
        match self {
            TrayState::Stopped => "Stopped",
            TrayState::Starting => "Starting...",
            TrayState::Stopping => "Stopping...",
            TrayState::Running => "Running",
            TrayState::Error => "Error",
            TrayState::Pm2Missing => "pm2 not found",
        }
    }
}

#[derive(Clone, Serialize)]
pub struct StatusPayload {
    pub state: TrayState,
    pub message: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ErrorPayload {
    pub action: String,
    pub message: String,
}

pub struct AppState {
    pub gateway_home: PathBuf,
    pub pm2_path: Mutex<Option<PathBuf>>,
    tray_state: Mutex<TrayState>,
    message: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(gateway_home: PathBuf) -> Self {
        Self {
            gateway_home,
            pm2_path: Mutex::new(None),
            tray_state: Mutex::new(TrayState::Stopped),
            message: Mutex::new(None),
        }
    }

    pub fn current(&self) -> TrayState {
        *self.tray_state.lock().unwrap()
    }

    pub fn message(&self) -> Option<String> {
        self.message.lock().unwrap().clone()
    }

    pub fn set(&self, app: &AppHandle, state: TrayState, message: Option<String>) {
        let mut tray_state = self.tray_state.lock().unwrap();
        let mut tray_message = self.message.lock().unwrap();

        if *tray_state == state && *tray_message == message {
            return;
        }

        *tray_state = state;
        *tray_message = message.clone();
        drop(tray_state);
        drop(tray_message);

        let payload = StatusPayload { state, message };
        let _ = app.emit("status-changed", &payload);
        crate::tray::update(app);
    }

    pub fn emit_error(&self, app: &AppHandle, action: &str, message: &str) {
        let _ = app.emit(
            "service-error",
            ErrorPayload {
                action: action.into(),
                message: message.into(),
            },
        );
    }
}
