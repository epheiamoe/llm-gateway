#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod commands;
mod config;
mod health;
mod pm2;
mod state;
mod tray;
mod window;
mod win32;

use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::config::{resolve_gateway_home, FALLBACK_GATEWAY_HOME};
use crate::state::{AppState, TrayState};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::open_status_window(app);
        }))
        // The MacosLauncher argument is ignored on Windows and Linux; it is required by the plugin API.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::start_service,
            commands::stop_service,
            commands::restart_service,
            commands::open_dashboard,
            commands::get_autostart,
            commands::set_autostart,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            let gateway_home = resolve_gateway_home(&app_handle)
                .or_else(|e| {
                    // Only use the built-in fallback if it is actually valid.
                    let fallback = std::path::PathBuf::from(FALLBACK_GATEWAY_HOME);
                    if crate::config::has_gateway_marker(&fallback) {
                        Ok(fallback)
                    } else {
                        Err(e)
                    }
                })
                .unwrap_or_else(|e| {
                    eprintln!("gateway home resolution failed: {}", e);
                    // Use an empty path as a sentinel; service operations will be disabled.
                    std::path::PathBuf::new()
                });
            let has_config = !gateway_home.as_os_str().is_empty()
                && gateway_home.join("pm2.config.json").exists();

            app.manage(AppState::new(gateway_home));
            let state = app.state::<AppState>();

            match pm2::resolve() {
                Ok(path) => {
                    *state.pm2_path.lock().unwrap() = Some(path);
                }
                Err(_) => {
                    state.set(
                        &app_handle,
                        TrayState::Pm2Missing,
                        Some("pm2 not found".into()),
                    );
                }
            }

            if !has_config && state.current() != TrayState::Pm2Missing {
                state.set(
                    &app_handle,
                    TrayState::Error,
                    Some("Gateway home does not contain pm2.config.json".into()),
                );
            }

            tray::build(&app_handle)?;
            // Hide the single-instance helper window so the tray app does not
            // show a 16x16 ghost window at startup.
            win32::single_instance_window::hide();
            // Do not open the status window automatically at startup to avoid
            // interrupting the user. It opens on tray left-click.

            // Background polling only: updates tray icon color and tooltip.
            let poll_app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                // Give the gateway a moment to finish starting before first poll.
                tokio::time::sleep(Duration::from_secs(2)).await;
                let s = poll_state(&poll_app).await;
                let state = poll_app.state::<AppState>();
                state.set(&poll_app, s, None);

                let mut interval = tokio::time::interval(Duration::from_secs(5));
                loop {
                    interval.tick().await;
                    let s = poll_state(&poll_app).await;
                    let state = poll_app.state::<AppState>();
                    state.set(&poll_app, s, None);
                }
            });

            // Auto-start the gateway service on tray launch if it is not already
            // running. This is silent: no windows are shown and all subprocesses
            // use CREATE_NO_WINDOW.
            if has_config && state.current() != TrayState::Pm2Missing {
                let auto_app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    let state = auto_app.state::<AppState>();
                    let (gateway_home, pm2_path) = {
                        let guard = state.pm2_path.lock().unwrap();
                        (state.gateway_home.clone(), guard.clone())
                    };
                    if let Some(pm2_path) = pm2_path {
                        if matches!(
                            health::poll(&gateway_home, Some(&pm2_path)).await,
                            health::ServiceState::Stopped
                        ) {
                            state.set(&auto_app, TrayState::Starting, Some("Auto-starting gateway service...".into()));
                            if let Err(e) = pm2::start_or_restart(&pm2_path, &gateway_home).await {
                                state.set(&auto_app, TrayState::Error, Some(format!("Auto-start failed: {}", e)));
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn poll_state(app: &AppHandle) -> TrayState {
    let state = app.state::<AppState>();
    let gateway_home = state.gateway_home.clone();
    let pm2_path = state.pm2_path.lock().unwrap().clone();

    if pm2_path.is_none() {
        return TrayState::Pm2Missing;
    }

    match health::poll(&gateway_home, pm2_path.as_deref()).await {
        health::ServiceState::Running => TrayState::Running,
        health::ServiceState::Starting => TrayState::Starting,
        health::ServiceState::Stopped => TrayState::Stopped,
        health::ServiceState::Pm2Missing => TrayState::Pm2Missing,
        health::ServiceState::Error { .. } => TrayState::Error,
    }
}
