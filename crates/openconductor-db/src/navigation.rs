//! Sidebar sections (`navigation_sections`) and which workspaces each holds
//! (`navigation_section_memberships`), per organization and user.
//!
//! The reference persists the whole sidebar layout at once rather than
//! editing one section at a time (renderApp bundle `renderApp-D_fmY7hW.js`,
//! offsets 176300-180600; `evidence/persistence/sql-literals-remaining-tables.txt`):
//!
//! - read: `SELECT * FROM navigation_sections WHERE <scope> ORDER BY
//!   sort_order ASC, created_at ASC, id ASC` and the memberships of those
//!   sections `ORDER BY navigation_section_memberships.created_at ASC,
//!   navigation_section_memberships.id ASC` (an `INNER JOIN` on the section).
//! - write ([`write_layout`]): skipped when a stored section's `updated_at`
//!   is newer than the layout's; otherwise, in one `BEGIN IMMEDIATE`
//!   transaction, `INSERT OR REPLACE` every section (`sort_order` = its index,
//!   `created_at` kept, `updated_at` kept when nothing about the section
//!   changed) and every membership (id and `created_at` kept per
//!   section/workspace pair, new ids are random UUIDs), then delete
//!   memberships and sections of this scope that the layout no longer has.
//! - delete ([`delete_layout`]): the scope's memberships, then its sections.
//!
//! In `conductor.db` the scope is `organization_id = ? AND user_id = ?` (the
//! reference adds `hosting_server_url` only for its `cache.db` copy). The
//! reference never writes `icon_name`, so a write leaves it NULL.

use sqlx::{Connection, SqliteConnection, SqlitePool};

use crate::{iso_time, Result};

/// The organization and user whose sidebar this is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scope {
    pub organization_id: String,
    pub user_id: String,
}

/// One `navigation_sections` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Section {
    pub id: String,
    pub organization_id: String,
    pub user_id: String,
    pub name: String,
    pub icon_name: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub emoji: Option<String>,
}

/// One `navigation_section_memberships` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Membership {
    pub id: String,
    pub section_id: String,
    pub workspace_id: String,
    pub created_at: String,
}

/// A section as the sidebar holds it: position is its index in
/// [`Layout::sections`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutSection {
    pub id: String,
    pub name: String,
    pub emoji: Option<String>,
    pub workspace_ids: Vec<String>,
}

/// The whole sidebar layout, stamped with when it last changed
/// (milliseconds since the Unix epoch).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Layout {
    pub sections: Vec<LayoutSection>,
    pub updated_at: i64,
}

const SCOPE: &str = "organization_id = ? AND user_id = ?";

/// The scope's sections and their memberships, in the reference's order.
pub async fn read(pool: &SqlitePool, scope: &Scope) -> Result<(Vec<Section>, Vec<Membership>)> {
    let mut conn = pool.acquire().await?;
    read_on(&mut conn, scope).await
}

async fn read_on(
    conn: &mut SqliteConnection,
    scope: &Scope,
) -> Result<(Vec<Section>, Vec<Membership>)> {
    let sections = sqlx::query_as::<_, Section>(&format!(
        "SELECT * FROM navigation_sections WHERE {SCOPE} \
         ORDER BY sort_order ASC, created_at ASC, id ASC"
    ))
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .fetch_all(&mut *conn)
    .await?;
    let memberships = sqlx::query_as::<_, Membership>(
        "SELECT navigation_section_memberships.* FROM navigation_section_memberships \
         INNER JOIN navigation_sections \
         ON navigation_sections.id = navigation_section_memberships.section_id \
         WHERE navigation_sections.organization_id = ? AND navigation_sections.user_id = ? \
         ORDER BY navigation_section_memberships.created_at ASC, \
         navigation_section_memberships.id ASC",
    )
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .fetch_all(&mut *conn)
    .await?;
    Ok((sections, memberships))
}

/// The scope's layout, or `None` when it has no sections. `updated_at` is the
/// newest section `updated_at` (unparsable values are skipped, 0 if none).
pub async fn read_layout(pool: &SqlitePool, scope: &Scope) -> Result<Option<Layout>> {
    let (sections, memberships) = read(pool, scope).await?;
    if sections.is_empty() {
        return Ok(None);
    }
    let updated_at = sections
        .iter()
        .filter_map(|s| iso_time::to_millis(&s.updated_at))
        .fold(0, i64::max);
    let sections = sections
        .into_iter()
        .map(|s| LayoutSection {
            workspace_ids: memberships
                .iter()
                .filter(|m| m.section_id == s.id)
                .map(|m| m.workspace_id.clone())
                .collect(),
            id: s.id,
            name: s.name,
            emoji: s.emoji,
        })
        .collect();
    Ok(Some(Layout {
        sections,
        updated_at,
    }))
}

/// Store `layout` as the scope's sidebar. Returns `false` (and writes
/// nothing) when a stored section is newer than `layout.updated_at`.
pub async fn write_layout(pool: &SqlitePool, scope: &Scope, layout: &Layout) -> Result<bool> {
    let mut conn = pool.acquire().await?;
    sqlx::query("BEGIN IMMEDIATE").execute(&mut *conn).await?;
    match write_layout_on(&mut conn, scope, layout).await {
        Ok(true) => {
            sqlx::query("COMMIT").execute(&mut *conn).await?;
            Ok(true)
        }
        other => {
            sqlx::query("ROLLBACK").execute(&mut *conn).await?;
            other
        }
    }
}

async fn write_layout_on(
    conn: &mut SqliteConnection,
    scope: &Scope,
    layout: &Layout,
) -> Result<bool> {
    let (stored, memberships) = read_on(conn, scope).await?;
    let newest = stored
        .iter()
        .filter_map(|s| iso_time::to_millis(&s.updated_at))
        .fold(0, i64::max);
    if newest > layout.updated_at {
        return Ok(false);
    }
    let now = iso_time::from_millis(layout.updated_at);
    let mut kept_memberships = Vec::new();
    for (position, section) in layout.sections.iter().enumerate() {
        let position = position as i64;
        let old = stored.iter().find(|s| s.id == section.id);
        let mut old_members: Vec<&str> = memberships
            .iter()
            .filter(|m| m.section_id == section.id)
            .map(|m| m.workspace_id.as_str())
            .collect();
        let mut new_members: Vec<&str> = section.workspace_ids.iter().map(String::as_str).collect();
        old_members.sort_unstable();
        new_members.sort_unstable();
        let unchanged = old.is_some_and(|o| {
            o.name == section.name
                && o.emoji == section.emoji
                && o.sort_order == position
                && old_members == new_members
        });
        let created_at = old.map_or(now.as_str(), |o| o.created_at.as_str());
        let updated_at = match old {
            Some(o) if unchanged => o.updated_at.as_str(),
            _ => now.as_str(),
        };
        sqlx::query(
            "INSERT OR REPLACE INTO navigation_sections \
             (id, organization_id, user_id, name, emoji, sort_order, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&section.id)
        .bind(&scope.organization_id)
        .bind(&scope.user_id)
        .bind(&section.name)
        .bind(&section.emoji)
        .bind(position)
        .bind(created_at)
        .bind(updated_at)
        .execute(&mut *conn)
        .await?;
        for workspace_id in &section.workspace_ids {
            let existing = memberships
                .iter()
                .find(|m| m.section_id == section.id && &m.workspace_id == workspace_id);
            let id = match existing {
                Some(m) => m.id.clone(),
                None => random_uuid(conn).await?,
            };
            sqlx::query(
                "INSERT OR REPLACE INTO navigation_section_memberships \
                 (id, section_id, workspace_id, created_at) VALUES (?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(&section.id)
            .bind(workspace_id)
            .bind(existing.map_or(now.as_str(), |m| m.created_at.as_str()))
            .execute(&mut *conn)
            .await?;
            kept_memberships.push(id);
        }
    }
    let section_ids: Vec<&str> = layout.sections.iter().map(|s| s.id.as_str()).collect();
    let sql = format!(
        "DELETE FROM navigation_section_memberships WHERE section_id IN ( \
         SELECT id FROM navigation_sections WHERE {SCOPE} ){}",
        not_in(kept_memberships.len())
    );
    let mut q = sqlx::query(&sql)
        .bind(&scope.organization_id)
        .bind(&scope.user_id);
    for id in &kept_memberships {
        q = q.bind(id);
    }
    q.execute(&mut *conn).await?;
    let sql = format!(
        "DELETE FROM navigation_sections WHERE {SCOPE}{}",
        not_in(section_ids.len())
    );
    let mut q = sqlx::query(&sql)
        .bind(&scope.organization_id)
        .bind(&scope.user_id);
    for id in &section_ids {
        q = q.bind(*id);
    }
    q.execute(&mut *conn).await?;
    Ok(true)
}

/// Delete the scope's memberships, then its sections.
pub async fn delete_layout(pool: &SqlitePool, scope: &Scope) -> Result<()> {
    let mut conn = pool.acquire().await?;
    let mut tx = conn.begin().await?;
    sqlx::query(&format!(
        "DELETE FROM navigation_section_memberships WHERE section_id IN ( \
         SELECT id FROM navigation_sections WHERE {SCOPE} )"
    ))
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(&format!("DELETE FROM navigation_sections WHERE {SCOPE}"))
        .bind(&scope.organization_id)
        .bind(&scope.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// ` AND id NOT IN (?, …)` for `n` ids, or nothing when `n` is 0 (the
/// reference's `sIn`).
fn not_in(n: usize) -> String {
    if n == 0 {
        return String::new();
    }
    format!(" AND id NOT IN ({})", vec!["?"; n].join(", "))
}

/// A random version 4 UUID in the lower-case form `crypto.randomUUID()` gives.
async fn random_uuid(conn: &mut SqliteConnection) -> Result<String> {
    Ok(sqlx::query_scalar(
        "SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || \
         substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || \
         substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))",
    )
    .fetch_one(&mut *conn)
    .await?)
}
