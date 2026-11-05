-- Sidebar navigation sections and favorite model configurations, scoped by
-- organization and user.

CREATE TABLE navigation_sections (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon_name TEXT,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    emoji TEXT
);

CREATE INDEX idx_navigation_sections_scope_sort_order
    ON navigation_sections (organization_id, user_id, sort_order);

CREATE TABLE navigation_section_memberships (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_navigation_section_memberships_section_id
    ON navigation_section_memberships (section_id);

CREATE TABLE favorite_models (
    organization_id TEXT,
    user_id TEXT,
    id TEXT,
    position INTEGER,
    configuration TEXT,
    created_at TEXT
);

CREATE INDEX idx_favorite_models_scope_position
    ON favorite_models (organization_id, user_id, position);
