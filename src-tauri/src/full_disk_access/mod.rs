#[cfg(any(target_os = "macos", test))]
mod probe;

/// A fail-open PermissionDenied heuristic, not proof of granted macOS permission.
/// Unsupported platforms reject the command as an OpenConductor design choice.
#[tauri::command]
pub fn check_full_disk_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(probe::check_with(
            || std::env::var_os("HOME").map(std::path::PathBuf::from),
            |path| std::fs::File::open(path),
        ))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Full Disk Access status is only supported on macOS".to_owned())
    }
}
