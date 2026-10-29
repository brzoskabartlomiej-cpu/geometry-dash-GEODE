//! Native shell for Geo Dash (Tauri 2).
//!
//! The whole game is the same TypeScript build that runs in the browser; this
//! shell only provides a real window, a real filesystem and a native WebView,
//! which is what makes the desktop build the "high quality" version: it can use
//! the `high` preset without a browser tab throttling frames.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Geo Dash");
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Geo Dash");
}
