//! Whose sidebar sections and favorite models a row belongs to.
//!
//! The reference runs the same `navigation_*` and `favorite_models`
//! statements on two databases and only the scope columns differ: local
//! (non-hosted) data lives in `conductor.db` scoped by `organization_id,
//! user_id`; cloud-hosted data lives in `cache.db` scoped by
//! `hosting_server_url, organization_id, user_id` (renderApp `MIr`, index
//! `Epe`: `scopeColumns` and `scopeValues`, joined as `<col> = ?` with ` AND
//! `). The hosting server is its `roundhouseBaseUrl`.

/// The scope of one sidebar layout or favorites list. `hosting_server_url`
/// is `None` for `conductor.db` and `Some` for `cache.db` (its tables have
/// the column; `conductor.db`'s do not).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scope {
    pub hosting_server_url: Option<String>,
    pub organization_id: String,
    pub user_id: String,
}

impl Scope {
    /// The scope columns in the reference's order.
    pub(crate) fn columns(&self) -> &'static [&'static str] {
        match self.hosting_server_url {
            Some(_) => &["hosting_server_url", "organization_id", "user_id"],
            None => &["organization_id", "user_id"],
        }
    }

    /// `<col> = ? AND …`, each column prefixed with `table.` when given (the
    /// reference's `TVe(columns, table)`).
    pub(crate) fn condition(&self, table: Option<&str>) -> String {
        let prefix = table.map(|t| format!("{t}.")).unwrap_or_default();
        self.columns()
            .iter()
            .map(|c| format!("{prefix}{c} = ?"))
            .collect::<Vec<_>>()
            .join(" AND ")
    }

    /// The values bound for [`Self::columns`], in the same order.
    pub(crate) fn values(&self) -> Vec<&str> {
        let mut v = Vec::with_capacity(3);
        if let Some(url) = &self.hosting_server_url {
            v.push(url.as_str());
        }
        v.push(self.organization_id.as_str());
        v.push(self.user_id.as_str());
        v
    }
}
