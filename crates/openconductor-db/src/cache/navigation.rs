//! `navigation_sections` and `navigation_section_memberships` in `cache.db`:
//! the cloud-hosted sidebar sections (named, optionally emoji-marked groups
//! of workspaces) last fetched from the hosting server, per [`Scope`]. The
//! reference keeps local sections in `conductor.db` with the same statements
//! minus `hosting_server_url`, and these in the cache database it passes as
//! `cacheDatabase` to the cloud sections store.
//!
//! The cached value is a list of sections in display order plus an
//! `updatedAt` (ms since the epoch); [`write`] refuses a value older than
//! what is stored and keeps each row's `created_at`, and an unchanged
//! section's `updated_at`, across rewrites.

use std::collections::HashMap;

use sqlx::{SqliteConnection, SqlitePool};

use super::{iso_from_millis, parse_millis, Scope};
use crate::Result;

/// One section as the sidebar uses it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NavigationSection {
    pub id: String,
    pub name: String,
    pub emoji: Option<String>,
    /// Member workspaces, in membership `created_at`, then membership id
    /// order. Members added in one write share `created_at`, so their order
    /// follows their random ids, as in the reference.
    pub workspace_ids: Vec<String>,
}

/// The cached sections and when they were last changed (ms since epoch).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Persisted {
    pub sections: Vec<NavigationSection>,
    pub updated_at: i64,
}

/// A `navigation_sections` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SectionRow {
    pub id: String,
    pub hosting_server_url: Option<String>,
    pub organization_id: String,
    pub user_id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub emoji: Option<String>,
}

/// A `navigation_section_memberships` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct MembershipRow {
    pub id: String,
    pub section_id: String,
    pub workspace_id: String,
    pub created_at: String,
}

/// The scope's rows. Statements: `SELECT * FROM navigation_sections WHERE
/// <scope> ORDER BY sort_order ASC, created_at ASC, id ASC` and `SELECT
/// navigation_section_memberships.* FROM navigation_section_memberships
/// INNER JOIN navigation_sections ON navigation_sections.id =
/// navigation_section_memberships.section_id WHERE <scope on
/// navigation_sections> ORDER BY navigation_section_memberships.created_at
/// ASC, navigation_section_memberships.id ASC`.
pub async fn rows(
    pool: &SqlitePool,
    scope: &Scope,
) -> Result<(Vec<SectionRow>, Vec<MembershipRow>)> {
    let mut conn = pool.acquire().await?;
    rows_on(&mut conn, scope).await
}

async fn rows_on(
    conn: &mut SqliteConnection,
    scope: &Scope,
) -> Result<(Vec<SectionRow>, Vec<MembershipRow>)> {
    let sections = sqlx::query_as::<_, SectionRow>(&format!(
        "SELECT * FROM navigation_sections WHERE {} \
         ORDER BY sort_order ASC, created_at ASC, id ASC",
        Scope::WHERE
    ))
    .bind(&scope.hosting_server_url)
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .fetch_all(&mut *conn)
    .await?;
    let memberships = sqlx::query_as::<_, MembershipRow>(
        "SELECT navigation_section_memberships.* \
         FROM navigation_section_memberships \
         INNER JOIN navigation_sections \
            ON navigation_sections.id = navigation_section_memberships.section_id \
         WHERE navigation_sections.hosting_server_url = ? \
           AND navigation_sections.organization_id = ? \
           AND navigation_sections.user_id = ? \
         ORDER BY navigation_section_memberships.created_at ASC, \
                  navigation_section_memberships.id ASC",
    )
    .bind(&scope.hosting_server_url)
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .fetch_all(&mut *conn)
    .await?;
    Ok((sections, memberships))
}

/// The cached value, or `None` when the scope has no sections. `updated_at`
/// is the newest row `updated_at` (0 when none parses), as the reference
/// projects it.
pub async fn read(pool: &SqlitePool, scope: &Scope) -> Result<Option<Persisted>> {
    let (sections, memberships) = rows(pool, scope).await?;
    if sections.is_empty() {
        return Ok(None);
    }
    let mut members: HashMap<&str, Vec<String>> = HashMap::new();
    for m in &memberships {
        members
            .entry(m.section_id.as_str())
            .or_default()
            .push(m.workspace_id.clone());
    }
    let updated_at = sections
        .iter()
        .filter_map(|s| parse_millis(&s.updated_at))
        .fold(0, i64::max);
    let sections = sections
        .iter()
        .map(|s| NavigationSection {
            id: s.id.clone(),
            name: s.name.clone(),
            emoji: s.emoji.clone(),
            workspace_ids: members.remove(s.id.as_str()).unwrap_or_default(),
        })
        .collect();
    Ok(Some(Persisted {
        sections,
        updated_at,
    }))
}

/// Store `value` as the scope's sections; `false` (nothing written) when the
/// stored rows are newer than `value.updated_at`.
///
/// The reference's write: a section's `sort_order` is its index, a new row's
/// `created_at` and a changed section's `updated_at` are
/// `value.updated_at`, a membership keeps its row id (new ones get a random
/// UUID); then `INSERT OR REPLACE INTO navigation_sections (id,
/// hosting_server_url, organization_id, user_id, name, emoji, sort_order,
/// created_at, updated_at) VALUES …`, `INSERT OR REPLACE INTO
/// navigation_section_memberships (id, section_id, workspace_id, created_at)
/// VALUES …`, `DELETE FROM navigation_section_memberships WHERE section_id
/// IN (SELECT id FROM navigation_sections WHERE <scope>) AND id NOT IN (…)`
/// and `DELETE FROM navigation_sections WHERE <scope> AND id NOT IN (…)`.
pub async fn write(pool: &SqlitePool, scope: &Scope, value: &Persisted) -> Result<bool> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let (stored, stored_members) = rows_on(&mut tx, scope).await?;
    // `Math.max(0, ...Date.parse(updated_at)) > updatedAt`: an unparsable
    // time makes the max NaN, which never compares greater.
    let newest: Option<i64> = stored
        .iter()
        .map(|s| parse_millis(&s.updated_at))
        .try_fold(0, |acc, t| t.map(|t| acc.max(t)));
    if newest.is_some_and(|t| t > value.updated_at) {
        return Ok(false);
    }

    let by_id: HashMap<&str, &SectionRow> = stored.iter().map(|s| (s.id.as_str(), s)).collect();
    let by_pair: HashMap<(&str, &str), &MembershipRow> = stored_members
        .iter()
        .map(|m| ((m.section_id.as_str(), m.workspace_id.as_str()), m))
        .collect();
    let mut stored_workspaces: HashMap<&str, Vec<&str>> = HashMap::new();
    for m in &stored_members {
        stored_workspaces
            .entry(m.section_id.as_str())
            .or_default()
            .push(m.workspace_id.as_str());
    }
    let now = iso_from_millis(value.updated_at);

    struct SectionValues<'a> {
        section: &'a NavigationSection,
        sort_order: i64,
        created_at: String,
        updated_at: String,
    }
    let mut section_values = Vec::new();
    let mut membership_values: Vec<(String, &str, &str, String)> = Vec::new();
    for (index, w) in value.sections.iter().enumerate() {
        let existing = by_id.get(w.id.as_str());
        let unchanged = existing.is_some_and(|e| {
            e.name == w.name
                && e.emoji == w.emoji
                && e.sort_order == index as i64
                && same_members(
                    stored_workspaces
                        .get(w.id.as_str())
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                    &w.workspace_ids,
                )
        });
        section_values.push(SectionValues {
            section: w,
            sort_order: index as i64,
            created_at: existing.map_or_else(|| now.clone(), |e| e.created_at.clone()),
            updated_at: match existing {
                Some(e) if unchanged => e.updated_at.clone(),
                _ => now.clone(),
            },
        });
        for workspace_id in &w.workspace_ids {
            let row = by_pair.get(&(w.id.as_str(), workspace_id.as_str()));
            membership_values.push((
                row.map_or_else(|| uuid::Uuid::new_v4().to_string(), |r| r.id.clone()),
                w.id.as_str(),
                workspace_id.as_str(),
                row.map_or_else(|| now.clone(), |r| r.created_at.clone()),
            ));
        }
    }

    if !section_values.is_empty() {
        let sql = format!(
            "INSERT OR REPLACE INTO navigation_sections \
             (id, hosting_server_url, organization_id, user_id, name, emoji, sort_order, created_at, updated_at) \
             VALUES {}",
            placeholders(9, section_values.len())
        );
        let mut q = sqlx::query(&sql);
        for v in &section_values {
            q = q
                .bind(&v.section.id)
                .bind(&scope.hosting_server_url)
                .bind(&scope.organization_id)
                .bind(&scope.user_id)
                .bind(&v.section.name)
                .bind(&v.section.emoji)
                .bind(v.sort_order)
                .bind(&v.created_at)
                .bind(&v.updated_at);
        }
        q.execute(&mut *tx).await?;
    }
    if !membership_values.is_empty() {
        let sql = format!(
            "INSERT OR REPLACE INTO navigation_section_memberships \
             (id, section_id, workspace_id, created_at) VALUES {}",
            placeholders(4, membership_values.len())
        );
        let mut q = sqlx::query(&sql);
        for (id, section_id, workspace_id, created_at) in &membership_values {
            q = q
                .bind(id)
                .bind(*section_id)
                .bind(*workspace_id)
                .bind(created_at);
        }
        q.execute(&mut *tx).await?;
    }

    let keep_members: Vec<&str> = membership_values.iter().map(|m| m.0.as_str()).collect();
    let sql = format!(
        "DELETE FROM navigation_section_memberships \
         WHERE section_id IN ( \
             SELECT id FROM navigation_sections WHERE {} \
         ){}",
        Scope::WHERE,
        not_in(keep_members.len())
    );
    let mut q = sqlx::query(&sql)
        .bind(&scope.hosting_server_url)
        .bind(&scope.organization_id)
        .bind(&scope.user_id);
    for id in &keep_members {
        q = q.bind(*id);
    }
    q.execute(&mut *tx).await?;

    let sql = format!(
        "DELETE FROM navigation_sections WHERE {}{}",
        Scope::WHERE,
        not_in(value.sections.len())
    );
    let mut q = sqlx::query(&sql)
        .bind(&scope.hosting_server_url)
        .bind(&scope.organization_id)
        .bind(&scope.user_id);
    for s in &value.sections {
        q = q.bind(&s.id);
    }
    q.execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(true)
}

/// Delete the scope's sections and their memberships. Statements: `DELETE
/// FROM navigation_section_memberships WHERE section_id IN (SELECT id FROM
/// navigation_sections WHERE <scope>)` then `DELETE FROM navigation_sections
/// WHERE <scope>`.
pub async fn delete(pool: &SqlitePool, scope: &Scope) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(&format!(
        "DELETE FROM navigation_section_memberships \
         WHERE section_id IN ( \
             SELECT id FROM navigation_sections WHERE {} \
         )",
        Scope::WHERE
    ))
    .bind(&scope.hosting_server_url)
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(&format!(
        "DELETE FROM navigation_sections WHERE {}",
        Scope::WHERE
    ))
    .bind(&scope.hosting_server_url)
    .bind(&scope.organization_id)
    .bind(&scope.user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Same members regardless of order (the reference compares sorted copies).
fn same_members(stored: &[&str], wanted: &[String]) -> bool {
    let mut a: Vec<&str> = stored.to_vec();
    let mut b: Vec<&str> = wanted.iter().map(String::as_str).collect();
    a.sort_unstable();
    b.sort_unstable();
    a == b
}

/// `(?, …, ?)` with `width` slots, repeated `rows` times.
fn placeholders(width: usize, rows: usize) -> String {
    let row = format!("({})", vec!["?"; width].join(", "));
    vec![row; rows].join(", ")
}

/// ` AND id NOT IN (?, …)`, or nothing for an empty list.
fn not_in(len: usize) -> String {
    if len == 0 {
        String::new()
    } else {
        format!(" AND id NOT IN ({})", vec!["?"; len].join(", "))
    }
}
