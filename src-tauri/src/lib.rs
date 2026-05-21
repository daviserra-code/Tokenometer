use tauri::{Manager, Url};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let url = std::env::var("TAURI_TOKENOMETER_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://www.tokenometer.cloud".to_string());

      let window = app
        .get_webview_window("main")
        .expect("main window should exist");

      match Url::parse(&url) {
        Ok(parsed) => {
          window.navigate(parsed)?;
        }
        Err(error) => {
          log::error!("Invalid TAURI_TOKENOMETER_URL '{}': {}", url, error);
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
