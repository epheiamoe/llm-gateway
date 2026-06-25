use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn open_status_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("status") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, "status", WebviewUrl::App("index.html".into()))
        .title("LLM Gateway Tray")
        .inner_size(360.0, 320.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(true)
        .visible(true)
        .build();
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
