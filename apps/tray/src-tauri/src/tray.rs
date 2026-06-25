use std::path::PathBuf;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::state::{AppState, TrayState};
use crate::window;

pub fn build(app: &AppHandle) -> Result<(), tauri::Error> {
    let state = app.state::<AppState>().current();
    let autostart_enabled = crate::autostart::is_enabled(app);
    let menu = build_menu(app, state, autostart_enabled)?;
    let icon = load_icon(app, state)?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip(&tooltip(state))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                window::open_status_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

pub fn update(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("main") {
        let state = app.state::<AppState>().current();
        let _ = tray.set_tooltip(Some(tooltip(state)));
        if let Ok(icon) = load_icon(app, state) {
            let _ = tray.set_icon(Some(icon));
        }
        let autostart_enabled = crate::autostart::is_enabled(app);
        if let Ok(menu) = build_menu(app, state, autostart_enabled) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn build_menu(
    app: &AppHandle,
    state: TrayState,
    autostart_enabled: bool,
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let actions_enabled = state != TrayState::Pm2Missing;

    let open_dashboard = MenuItem::with_id(app, "open_dashboard", "Open Dashboard", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "Start Service", actions_enabled, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop Service", actions_enabled, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart Service", actions_enabled, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Auto-start on logon",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &open_dashboard,
            &start,
            &stop,
            &restart,
            &autostart,
            &separator,
            &exit,
        ],
    )
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    let app = app.clone();
    match id {
        "open_dashboard" => {
            tauri::async_runtime::spawn(async move {
                let _ = crate::commands::open_dashboard(app).await;
            });
        }
        "start" => {
            tauri::async_runtime::spawn(async move {
                let _ = crate::commands::start_service(app).await;
            });
        }
        "stop" => {
            tauri::async_runtime::spawn(async move {
                let _ = crate::commands::stop_service(app).await;
            });
        }
        "restart" => {
            tauri::async_runtime::spawn(async move {
                let _ = crate::commands::restart_service(app).await;
            });
        }
        "autostart" => {
            let enabled = !crate::autostart::is_enabled(&app);
            let _ = crate::autostart::set_enabled(&app, enabled);
            update(&app);
        }
        "exit" => {
            app.exit(0);
        }
        _ => {}
    }
}

fn load_icon(app: &AppHandle, state: TrayState) -> Result<Image<'_>, tauri::Error> {
    let file = match state {
        TrayState::Running => "icon-green.png",
        TrayState::Starting => "icon-yellow.png",
        _ => "icon-red.png",
    };

    // Try the Tauri resource directory first (used by dev and some bundled installs).
    if let Ok(path) = app.path().resolve(file, tauri::path::BaseDirectory::Resource) {
        if path.exists() {
            return Image::from_path(&path);
        }
    }

    // Fallback: icons placed next to the executable or in an `icons` subdirectory
    // (used by MSI/NSIS bundles).
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(PathBuf::from).unwrap_or_default()) {
        let candidates = [exe_dir.join(file), exe_dir.join("icons").join(file)];
        for path in candidates.iter() {
            if path.exists() {
                return Image::from_path(&path);
            }
        }

        // Final safety net: if a colored icon is missing, fall back to the default bundled icon.
        let fallback_candidates = [exe_dir.join("icon.ico"), exe_dir.join("icons").join("icon.ico")];
        for path in fallback_candidates.iter() {
            if path.exists() {
                return Image::from_path(&path);
            }
        }
    }

    Err(tauri::Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("tray icon file not found: {}", file),
    )))
}

fn tooltip(state: TrayState) -> String {
    format!("LLM Gateway Tray — {}", state.label())
}
