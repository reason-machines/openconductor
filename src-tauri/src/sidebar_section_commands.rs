//! IPC for the sidebar's user sections. Conductor v0.87.6 keeps a local
//! organization's sections in `conductor.db` and, like its local backend
//! (renderApp-D_fmY7hW.js `WIr`), the app reads the whole layout and writes the
//! whole layout back after each edit; the edits themselves are pure functions
//! in `src/state/navigationSections.ts`. The queries are tested in
//! `crates/openconductor-db` (`navigation::read_layout`, `write_layout`).

use openconductor_db::navigation::{self, Layout, LayoutSection, Scope};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

/// OpenConductor has no accounts: every local layout uses one fixed scope.
const LOCAL_ORGANIZATION_ID: &str = "local";
const LOCAL_USER_ID: &str = "local";

fn local_scope() -> Scope {
    Scope {
        hosting_server_url: None,
        organization_id: LOCAL_ORGANIZATION_ID.to_owned(),
        user_id: LOCAL_USER_ID.to_owned(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionDto {
    pub id: String,
    pub name: String,
    pub emoji: Option<String>,
    pub workspace_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutDto {
    pub sections: Vec<SectionDto>,
    pub updated_at: i64,
}

impl From<Layout> for LayoutDto {
    fn from(layout: Layout) -> Self {
        LayoutDto {
            sections: layout
                .sections
                .into_iter()
                .map(|s| SectionDto {
                    id: s.id,
                    name: s.name,
                    emoji: s.emoji,
                    workspace_ids: s.workspace_ids,
                })
                .collect(),
            updated_at: layout.updated_at,
        }
    }
}

fn layout_of(sections: Vec<SectionDto>, updated_at: i64) -> Layout {
    Layout {
        sections: sections
            .into_iter()
            .map(|s| LayoutSection {
                id: s.id,
                name: s.name,
                emoji: s.emoji,
                workspace_ids: s.workspace_ids,
            })
            .collect(),
        updated_at,
    }
}

/// JS: `invoke("db_read_navigation_sections")`: the stored layout, or null
/// when there are no sections.
#[tauri::command]
pub async fn db_read_navigation_sections(db: State<'_, Db>) -> Result<Option<LayoutDto>, String> {
    navigation::read_layout(&db.0, &local_scope())
        .await
        .map(|layout| layout.map(LayoutDto::from))
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_write_navigation_sections", { sections, updatedAt })`:
/// store the whole layout. False (nothing written) when the stored layout is
/// newer than `updatedAt`.
#[tauri::command]
pub async fn db_write_navigation_sections(
    db: State<'_, Db>,
    sections: Vec<SectionDto>,
    updated_at: i64,
) -> Result<bool, String> {
    navigation::write_layout(&db.0, &local_scope(), &layout_of(sections, updated_at))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_round_trips_through_the_dto() {
        let dto = vec![SectionDto {
            id: "s1".into(),
            name: "Focus".into(),
            emoji: Some("🔥".into()),
            workspace_ids: vec!["w1".into(), "w2".into()],
        }];
        let layout = layout_of(dto.clone(), 42);
        assert_eq!(layout.updated_at, 42);
        assert_eq!(
            LayoutDto::from(layout),
            LayoutDto {
                sections: dto,
                updated_at: 42
            }
        );
    }

    #[test]
    fn dto_uses_the_frontend_field_names() {
        let json = serde_json::to_value(LayoutDto {
            sections: vec![SectionDto {
                id: "s1".into(),
                name: "Focus".into(),
                emoji: None,
                workspace_ids: vec!["w1".into()],
            }],
            updated_at: 7,
        })
        .unwrap();
        assert_eq!(json["updatedAt"], 7);
        assert_eq!(json["sections"][0]["workspaceIds"][0], "w1");
        assert!(json["sections"][0]["emoji"].is_null());
    }
}
