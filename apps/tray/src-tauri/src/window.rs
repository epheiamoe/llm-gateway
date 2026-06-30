use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn open_status_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("status") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // Build from the pre-defined configuration so Tauri does not auto-create a
    // visible window at startup. The configuration has `create: false` and
    // `visible: false`; we explicitly show it here when the user requests it.
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "status")
        .expect("missing 'status' window config")
        .clone();
    if let Ok(window) = WebviewWindowBuilder::from_config(app, &config).and_then(|b| b.build()) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn open_dashboard_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("dashboard") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(
        app,
        "dashboard",
        WebviewUrl::External("http://127.0.0.1:3456/ui".parse().unwrap()),
    )
    .title("LLM Gateway Dashboard")
    .inner_size(1280.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .build();
}
