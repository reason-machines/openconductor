-- Cached favorite model configurations, ordered per scope.

CREATE TABLE favorite_models (
    hosting_server_url TEXT,
    organization_id TEXT,
    user_id TEXT,
    id TEXT,
    position INTEGER,
    configuration TEXT,
    created_at TEXT
);

CREATE INDEX idx_favorite_models_scope_position
    ON favorite_models (hosting_server_url, organization_id, user_id, position);
