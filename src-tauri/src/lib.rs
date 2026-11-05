pub mod checkpoint;

use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

pub fn app_info_value() -> AppInfo {
    AppInfo {
        name: "OpenConductor".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
fn app_info() -> AppInfo {
    app_info_value()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running OpenConductor");
}

#[cfg(test)]
mod app_tests {
    use super::*;

    #[test]
    fn app_info_is_branded() {
        let info = app_info_value();
        assert_eq!(info.name, "OpenConductor");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
