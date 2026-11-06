//! IPC for the sidebar's repository actions: hide / unhide a repository and
//! the manual repository order. Conductor v0.87.6 writes both straight to
//! `repos.hidden` and `repos.display_order` from its repo list
//! (renderApp-D_fmY7hW.js @10042864); the queries are tested in
//! `crates/openconductor-db` (`repos::set_hidden`, `repos::reorder`).

use tauri::State;

use crate::db::Db;

/// JS: `invoke("db_set_repo_hidden", { repoId, hidden })`.
#[tauri::command]
pub async fn db_set_repo_hidden(
    db: State<'_, Db>,
    repo_id: String,
    hidden: bool,
) -> Result<(), String> {
    openconductor_db::repos::set_hidden(&db.0, &repo_id, hidden)
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_reorder_repos", { ids })`: every repository id, in the
/// new sidebar order (hidden ones included).
#[tauri::command]
pub async fn db_reorder_repos(db: State<'_, Db>, ids: Vec<String>) -> Result<(), String> {
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    openconductor_db::repos::reorder(&db.0, &ids)
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_set_repo_icon", { repoId, icon })`: `"emoji:<e>"`, a
/// `data:image/...` URL, a bundled icon name, or null to clear it.
#[tauri::command]
pub async fn db_set_repo_icon(
    db: State<'_, Db>,
    repo_id: String,
    icon: Option<String>,
) -> Result<(), String> {
    openconductor_db::repos::set_icon(&db.0, &repo_id, icon.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Where Conductor looks for a repository favicon, in order (decoded
/// renderApp-D_fmY7hW.js, `sUs` before `aUs` @6097094).
pub const FAVICON_PATHS: &[&str] = &[
    "public/apple-touch-icon.png",
    "apple-touch-icon.png",
    "public/favicon.svg",
    "public/logo.svg",
    "favicon.svg",
    "logo.svg",
    "icon.svg",
    "public/favicon.png",
    "public/icon.png",
    "public/logo.png",
    "favicon.png",
    "logo.png",
    "icon.png",
    "app/icon.png",
    "src/app/icon.png",
    ".github/logo.png",
    ".github/logo.svg",
    "public/favicon.ico",
    "favicon.ico",
    "app/favicon.ico",
    "static/favicon.ico",
    "static/favicon.png",
    "static/favicon.svg",
    "assets/favicon.ico",
    "assets/favicon.png",
    "assets/icon.png",
    "src-tauri/icons/icon.png",
    "src/assets/icon.png",
];

/// Larger files are skipped: a sidebar icon has no use for them.
const FAVICON_MAX_BYTES: u64 = 1024 * 1024;

fn favicon_mime(path: &str) -> &'static str {
    match path.rsplit('.').next().map(str::to_ascii_lowercase).as_deref() {
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/png",
    }
}

/// The first favicon in `root` at one of [`FAVICON_PATHS`], as a data URL.
pub fn find_favicon(root: &std::path::Path) -> Option<String> {
    use base64::Engine as _;
    FAVICON_PATHS.iter().find_map(|rel| {
        let path = root.join(rel);
        let meta = std::fs::metadata(&path).ok()?;
        if !meta.is_file() || meta.len() > FAVICON_MAX_BYTES {
            return None;
        }
        let bytes = std::fs::read(&path).ok()?;
        let data = base64::engine::general_purpose::STANDARD.encode(bytes);
        Some(format!("data:{};base64,{data}", favicon_mime(rel)))
    })
}

/// JS: `invoke("repo_favicon", { rootPath })`.
#[tauri::command]
pub async fn repo_favicon(root_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || find_favicon(std::path::Path::new(&root_path)))
        .await
        .ok()
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_first_favicon_in_conductor_order() {
        let dir = std::env::temp_dir().join(format!("oc-favicon-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("public")).unwrap();
        assert_eq!(find_favicon(&dir), None);
        std::fs::write(dir.join("favicon.ico"), [0u8, 0, 1, 0]).unwrap();
        assert_eq!(
            find_favicon(&dir).as_deref(),
            Some("data:image/x-icon;base64,AAABAA==")
        );
        // public/favicon.svg comes before favicon.ico.
        std::fs::write(dir.join("public/favicon.svg"), "<svg/>").unwrap();
        assert_eq!(
            find_favicon(&dir).as_deref(),
            Some("data:image/svg+xml;base64,PHN2Zy8+")
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
