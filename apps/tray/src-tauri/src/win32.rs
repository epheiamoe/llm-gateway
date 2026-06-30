/// Helpers for Windows-specific tray behavior.
#[cfg(windows)]
pub mod single_instance_window {
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, TRUE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, ShowWindow, SW_HIDE,
    };

    static HID_DONE: AtomicBool = AtomicBool::new(false);

    extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let target_pid = lparam as u32;
            let mut win_pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut win_pid);
            if win_pid != target_pid {
                return TRUE;
            }

            let mut buf = [0u16; 256];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            if len > 0 {
                let title = String::from_utf16_lossy(&buf[..len as usize]);
                if title.ends_with("-siw") {
                    ShowWindow(hwnd, SW_HIDE);
                }
            }
            TRUE
        }
    }

    /// Hide the tiny helper window created by `tauri-plugin-single-instance`.
    /// It is normally visible at startup (16x16 at 0,0) which can show up as a
    /// ghost window in task switchers. Calling this once after tray setup
    /// removes it from view without breaking single-instance messaging.
    pub fn hide() {
        if HID_DONE.swap(true, Ordering::SeqCst) {
            return;
        }
        #[cfg(windows)]
        unsafe {
            let pid = std::process::id();
            EnumWindows(Some(enum_proc), pid as LPARAM);
        }
    }
}

#[cfg(not(windows))]
pub mod single_instance_window {
    pub fn hide() {}
}
