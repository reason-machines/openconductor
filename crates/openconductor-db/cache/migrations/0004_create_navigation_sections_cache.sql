-- Cached sidebar navigation sections, scoped by hosting server, organization
-- and user.

CREATE TABLE navigation_sections (
    id TEXT PRIMARY KEY,
    hosting_server_url TEXT,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_navigation_sections_scope_sort_order
    ON navigation_sections (hosting_server_url, organization_id, user_id, sort_order);

CREATE TABLE navigation_section_memberships (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_navigation_section_memberships_section_id
    ON navigation_section_memberships (section_id);
