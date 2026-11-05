//! IPC for the sidebar's Rename workspace dialog. Conductor v0.87.6 splits
//! the rename the same way (decoded index-BGEQ8YjU.js): the frontend
//! service (`JQe` @1037643) turns the typed name into a directory name and
//! decides what to persist; the local workspace server (`renameWorkspace`
//! @1050054) refuses an initializing workspace, a name another workspace of
//! the repository already uses and a directory that already exists, then:
//!
//! - ready / setting up: leaves the worktree where it is, creates a sibling
//!   symlink with the new name (unless renaming back to the original
//!   directory) and records it as `secondary_directory_name`; the previous
//!   name's symlink is queued in `symlinks_pending_deletion`;
//! - any other state: rewrites `directory_name` and `workspace_path`.

use std::path::{Path, PathBuf};

use tauri::State;

use openconductor_db::workspace_rename as rename;

use crate::db::Db;

/// Conductor's directory-name rule (`YQe`): letters, numbers, marks, `_`
/// and `-` only. Rust has no Unicode mark class in std, so combining marks
/// are refused here; the frontend sends NFC names, where they are rare.
pub fn valid_directory_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

/// JS: `invoke("db_rename_workspace", { workspaceId, newDirectoryName,
/// workspaceName, userSet })`. `workspaceName` is what `workspace_name`
/// becomes (null when the typed name equals the directory name).
#[tauri::command]
pub async fn db_rename_workspace(
    db: State<'_, Db>,
    workspace_id: String,
    new_directory_name: String,
    workspace_name: Option<String>,
    user_set: bool,
) -> Result<(), String> {
    let pool = &db.0;
    if !valid_directory_name(&new_directory_name) {
        return Err("Name can only contain letters, numbers, hyphens, and underscores".into());
    }
    let ws = rename::naming(pool, &workspace_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
    if ws.state == "initializing" {
        return Err("Cannot rename while workspace is initializing".into());
    }
    let taken = rename::taken_directory_names(pool, &ws.repository_id, &workspace_id)
        .await
        .map_err(|e| e.to_string())?;
    if taken.iter().any(|n| n == &new_directory_name) {
        return Err(format!(
            "Name \"{new_directory_name}\" is already used by another workspace"
        ));
    }

    let real_path = ws.workspace_path.as_deref().map(PathBuf::from);
    let Some(real_path) = real_path else {
        // No worktree on disk yet: only the names change.
        return rename::record_secondary_name(
            pool,
            &workspace_id,
            None,
            workspace_name.as_deref(),
            user_set,
        )
        .await
        .map_err(|e| e.to_string());
    };
    let parent = real_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let new_path = parent.join(&new_directory_name);
    let user_visible = match &ws.secondary_directory_name {
        Some(secondary) => parent.join(secondary),
        None => real_path.clone(),
    };
    if new_path != real_path && new_path.exists() && !is_symlink(&new_path) {
        return Err(format!(
            "Directory \"{new_directory_name}\" already exists on disk"
        ));
    }

    if ws.state == "ready" || ws.state == "setting_up" {
        let back_to_original = new_directory_name == ws.directory_name;
        if !back_to_original {
            if is_symlink(&new_path) {
                std::fs::remove_file(&new_path).map_err(|e| e.to_string())?;
            }
            symlink_dir(&real_path, &new_path).map_err(|e| e.to_string())?;
        }
        let secondary = (!back_to_original).then_some(new_directory_name.as_str());
        rename::record_secondary_name(
            pool,
            &workspace_id,
            secondary,
            workspace_name.as_deref(),
            user_set,
        )
        .await
        .map_err(|e| e.to_string())?;
        if is_symlink(&user_visible) {
            rename::queue_symlink_deletion(pool, &user_visible.to_string_lossy())
                .await
                .map_err(|e| e.to_string())?;
        }
        if !back_to_original {
            rename::unqueue_symlink_deletion(pool, &new_path.to_string_lossy())
                .await
                .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    rename::record_directory_name(
        pool,
        &workspace_id,
        &new_directory_name,
        &new_path.to_string_lossy(),
        workspace_name.as_deref(),
        user_set,
    )
    .await
    .map_err(|e| e.to_string())
}

/// JS: `invoke("db_mark_user_set_branch_name", { workspaceId })`: after a
/// branch rename the user asked for (Conductor's `markUserSetBranchName`).
#[tauri::command]
pub async fn db_mark_user_set_branch_name(
    db: State<'_, Db>,
    workspace_id: String,
) -> Result<(), String> {
    rename::mark_user_set_branch_name(&db.0, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}

fn is_symlink(p: &Path) -> bool {
    std::fs::symlink_metadata(p)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(unix)]
fn symlink_dir(target: &Path, link: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn symlink_dir(target: &Path, link: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directory_names_follow_conductors_rule() {
        assert!(valid_directory_name("login-fix_2"));
        assert!(valid_directory_name("café"));
        assert!(!valid_directory_name(""));
        assert!(!valid_directory_name("a/b"));
        assert!(!valid_directory_name(".."));
        assert!(!valid_directory_name("a b"));
    }
}
