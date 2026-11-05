//! Port forwards (`port_forwards`): a workspace's remote port tunnelled to a
//! local port. `(workspace_id, remote_port)` and `local_port` are each
//! unique. Remote port 22 is the workspace's SSH forward.
//!
//! Every statement is the reference's (frontend bundle `index-BGEQ8YjU.js`,
//! offsets 1042648 and 3256747-3427059;
//! `evidence/persistence/sql-literals-remaining-tables.txt`). Its row mapper
//! reads `enabled` and `auto_detected` as `=== 1` and passes the rest through;
//! the reference allocates new local ports in 20000-29999 (ports below 1024
//! are never targeted), which is the caller's business, not this module's.

use sqlx::SqlitePool;

use crate::{exec, Result};

/// The remote port of a workspace's SSH forward (the reference's `Rn = 22`).
pub const SSH_REMOTE_PORT: i64 = 22;

/// One `port_forwards` row.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct PortForward {
    pub id: String,
    pub workspace_id: Option<String>,
    pub remote_port: Option<i64>,
    pub local_port: Option<i64>,
    pub protocol: Option<String>,
    pub label: Option<String>,
    pub enabled: bool,
    pub auto_detected: bool,
    pub created_at: Option<String>,
}

/// Columns for [`PortForward`]; the reference's `SELECT *` with its `=== 1`
/// flag reads applied (NULL reads as `false`).
const COLUMNS: &str = "id, workspace_id, remote_port, local_port, protocol, label, \
    COALESCE(enabled = 1, 0) AS enabled, COALESCE(auto_detected = 1, 0) AS auto_detected, \
    created_at";

/// What [`insert`] writes; `enabled` and `created_at` take their column
/// defaults (1 and now), as in the reference.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewPortForward {
    pub id: String,
    pub workspace_id: String,
    pub remote_port: i64,
    pub local_port: i64,
    pub protocol: String,
    pub label: Option<String>,
    pub auto_detected: bool,
}

/// `workspace_id`'s forwards by remote port
/// (`SELECT * FROM port_forwards WHERE workspace_id = ? ORDER BY remote_port`).
pub async fn list_for_workspace(pool: &SqlitePool, workspace_id: &str) -> Result<Vec<PortForward>> {
    Ok(sqlx::query_as::<_, PortForward>(&format!(
        "SELECT {COLUMNS} FROM port_forwards WHERE workspace_id = ? ORDER BY remote_port"
    ))
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

/// The forward with `id`, if any (`SELECT * FROM port_forwards WHERE id = ?`).
pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<PortForward>> {
    Ok(sqlx::query_as::<_, PortForward>(&format!(
        "SELECT {COLUMNS} FROM port_forwards WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

/// Insert a forward. Fails on a duplicate `id`, `(workspace_id,
/// remote_port)` or `local_port`, as the reference's plain `INSERT` does.
pub async fn insert(pool: &SqlitePool, f: &NewPortForward) -> Result<()> {
    let q = sqlx::query(
        "INSERT INTO port_forwards (id, workspace_id, remote_port, local_port, protocol, label, \
         auto_detected) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&f.id)
    .bind(&f.workspace_id)
    .bind(f.remote_port)
    .bind(f.local_port)
    .bind(&f.protocol)
    .bind(&f.label)
    .bind(f.auto_detected);
    exec(q, pool).await.map(|_| ())
}

/// Turn forward `id` on or off (`UPDATE port_forwards SET enabled = ? WHERE id = ?`).
/// A missing row is not an error.
pub async fn set_enabled(pool: &SqlitePool, id: &str, enabled: bool) -> Result<()> {
    let q = sqlx::query("UPDATE port_forwards SET enabled = ? WHERE id = ?")
        .bind(enabled)
        .bind(id);
    exec(q, pool).await.map(|_| ())
}

/// Move forward `id` to `local_port`; `false` when no row has `id` (the
/// reference checks `rowsAffected`).
pub async fn set_local_port(pool: &SqlitePool, id: &str, local_port: i64) -> Result<bool> {
    let q = sqlx::query("UPDATE port_forwards SET local_port = ? WHERE id = ?")
        .bind(local_port)
        .bind(id);
    Ok(exec(q, pool).await? != 0)
}

/// Delete forward `id`; a missing row is fine.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<()> {
    let q = sqlx::query("DELETE FROM port_forwards WHERE id = ?").bind(id);
    exec(q, pool).await.map(|_| ())
}

/// Delete every forward of `workspace_id`.
pub async fn delete_for_workspace(pool: &SqlitePool, workspace_id: &str) -> Result<()> {
    let q = sqlx::query("DELETE FROM port_forwards WHERE workspace_id = ?").bind(workspace_id);
    exec(q, pool).await.map(|_| ())
}

/// Local ports held by forwards of existing workspaces, for allocation.
pub async fn allocated_local_ports(pool: &SqlitePool) -> Result<Vec<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT pf.local_port FROM port_forwards pf JOIN workspaces w ON pf.workspace_id = w.local_id",
    )
    .fetch_all(pool)
    .await?)
}

/// Delete forwards missing a workspace, remote port or local port, or whose
/// workspace row is gone. Run before allocating a local port. Returns how
/// many rows went.
pub async fn delete_orphans(pool: &SqlitePool) -> Result<u64> {
    exec(
        sqlx::query(
            "DELETE FROM port_forwards WHERE workspace_id IS NULL OR remote_port IS NULL \
             OR local_port IS NULL OR NOT EXISTS ( \
             SELECT 1 FROM workspaces w WHERE w.local_id = port_forwards.workspace_id )",
        ),
        pool,
    )
    .await
}

/// Delete forwards of archived workspaces. Returns how many rows went.
pub async fn delete_for_archived_workspaces(pool: &SqlitePool) -> Result<u64> {
    exec(
        sqlx::query(
            "DELETE FROM port_forwards WHERE EXISTS ( SELECT 1 FROM workspaces w \
             WHERE w.local_id = port_forwards.workspace_id AND w.state = 'archived' )",
        ),
        pool,
    )
    .await
}

/// A forward holding a local port, with its workspace's
/// `port_forwarding_enabled` (`None` when the workspace row is gone).
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct LocalPortHolder {
    pub id: String,
    pub workspace_id: Option<String>,
    pub remote_port: Option<i64>,
    pub enabled: Option<i64>,
    pub auto_detected: Option<i64>,
    pub port_forwarding_enabled: Option<i64>,
}

/// The forwards on `local_port`; the reference moves them elsewhere before
/// taking the port for another forward.
pub async fn holders_of_local_port(
    pool: &SqlitePool,
    local_port: i64,
) -> Result<Vec<LocalPortHolder>> {
    Ok(sqlx::query_as::<_, LocalPortHolder>(
        "SELECT pf.id, pf.workspace_id, pf.remote_port, pf.enabled, pf.auto_detected, \
         w.port_forwarding_enabled FROM port_forwards pf \
         LEFT JOIN workspaces w ON w.local_id = pf.workspace_id WHERE pf.local_port = ?",
    )
    .bind(local_port)
    .fetch_all(pool)
    .await?)
}

/// An enabled SSH forward of a workspace that is not archived, with the
/// workspace fields the reference uses to name its `~/.ssh/config` host.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SshForward {
    /// The forward's id.
    pub forward_id: String,
    pub workspace_id: String,
    pub local_port: Option<i64>,
    pub branch: Option<String>,
    pub directory_name: Option<String>,
    pub secondary_directory_name: Option<String>,
    pub repository_id: Option<String>,
}

/// Enabled SSH forwards (remote port 22) of workspaces that are not
/// archived, ordered as the reference orders its SSH config hosts:
/// `COALESCE(w.secondary_directory_name, w.directory_name), w.repository_id,
/// w.local_id`.
pub async fn ssh_forwards(pool: &SqlitePool) -> Result<Vec<SshForward>> {
    Ok(sqlx::query_as::<_, SshForward>(
        "SELECT pf.id AS forward_id, w.local_id AS workspace_id, pf.local_port, w.branch, \
         w.directory_name, w.secondary_directory_name, w.repository_id \
         FROM port_forwards pf JOIN workspaces w ON pf.workspace_id = w.local_id \
         WHERE pf.remote_port = 22 AND pf.enabled = 1 AND w.state != 'archived' \
         ORDER BY COALESCE(w.secondary_directory_name, w.directory_name), w.repository_id, w.local_id",
    )
    .fetch_all(pool)
    .await?)
}

/// An enabled forward of a hosted (cloud) workspace that is not archived.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct HostedPortForward {
    #[sqlx(flatten)]
    pub forward: PortForward,
    pub hosting_server_url: String,
    pub permission_level: Option<String>,
}

/// Enabled forwards of hosted workspaces that are not archived; the
/// reference restarts these tunnels at launch.
pub async fn enabled_hosted(pool: &SqlitePool) -> Result<Vec<HostedPortForward>> {
    Ok(sqlx::query_as::<_, HostedPortForward>(
        "SELECT pf.id, pf.workspace_id, pf.remote_port, pf.local_port, pf.protocol, pf.label, \
         COALESCE(pf.enabled = 1, 0) AS enabled, COALESCE(pf.auto_detected = 1, 0) AS auto_detected, \
         pf.created_at, w.hosting_server_url, w.permission_level \
         FROM port_forwards pf JOIN workspaces w ON pf.workspace_id = w.local_id \
         WHERE pf.enabled = 1 AND w.hosting_server_url IS NOT NULL AND w.state != 'archived'",
    )
    .fetch_all(pool)
    .await?)
}

/// Whether any workspace of `organization_id` on `hosting_server_url` with
/// port forwarding on has an enabled forward other than SSH.
pub async fn organization_has_enabled_forward(
    pool: &SqlitePool,
    organization_id: &str,
    hosting_server_url: &str,
) -> Result<bool> {
    let row: Option<String> = sqlx::query_scalar(
        "SELECT pf.id FROM port_forwards pf JOIN workspaces w ON w.local_id = pf.workspace_id \
         WHERE w.organization_id = ? AND w.hosting_server_url = ? \
         AND w.port_forwarding_enabled = 1 AND pf.enabled = 1 AND pf.remote_port != ? LIMIT 1",
    )
    .bind(organization_id)
    .bind(hosting_server_url)
    .bind(SSH_REMOTE_PORT)
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}
