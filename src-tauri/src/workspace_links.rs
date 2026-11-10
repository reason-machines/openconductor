use openconductor_db::workspace_links::{self, LinkKind};
use serde::Deserialize;
use tauri::State;

use crate::db::Db;

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkTarget {
    Workspace,
    Directory,
}

#[tauri::command]
pub async fn workspace_set_link(db: State<'_, Db>, workspace_id: String, kind: LinkTarget, value: String, linked: bool) -> Result<(), String> {
    let kind = match kind {
        LinkTarget::Workspace => LinkKind::Workspace,
        LinkTarget::Directory => {
            let path = std::path::Path::new(&value);
            if !path.is_absolute() || value.chars().any(char::is_control) || path.components().any(|p| matches!(p, std::path::Component::ParentDir | std::path::Component::CurDir)) {
                return Err("Choose an absolute local directory path.".into());
            }
            if linked && !path.is_dir() {
                return Err("The selected directory no longer exists or is not a directory.".into());
            }
            LinkKind::Directory
        }
    };
    workspace_links::set(&db.0, &workspace_id, kind, &value, linked).await.map_err(|e| e.to_string())
}
