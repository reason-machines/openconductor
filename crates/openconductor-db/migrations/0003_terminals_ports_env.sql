-- Terminal history, port forwards, scoped environment variables and
-- housekeeping tables.

CREATE TABLE terminal_sessions (
    session_id TEXT PRIMARY KEY,
    workspace_id TEXT,
    started_at TEXT,
    ended_at TEXT,
    cwd TEXT,
    cols INTEGER,
    rows INTEGER,
    rehydrate_sequences TEXT,
    alternate_screen INTEGER,
    bracketed_paste INTEGER,
    has_received_user_input INTEGER
);

CREATE TABLE port_forwards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    remote_port INTEGER,
    local_port INTEGER,
    protocol TEXT DEFAULT 'tcp',
    label TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    auto_detected INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX idx_port_forwards_workspace_remote
    ON port_forwards(workspace_id, remote_port);
CREATE UNIQUE INDEX idx_port_forwards_local_port
    ON port_forwards(local_port);

CREATE TABLE env_vars (
    key TEXT,
    scope TEXT,
    context TEXT,
    value TEXT
);

CREATE UNIQUE INDEX idx_env_vars_key_scope_context
    ON env_vars(key, scope, context);

CREATE TABLE symlinks_pending_deletion (
    path TEXT
);

CREATE TABLE migration_rollbacks (
    version INTEGER PRIMARY KEY,
    down_sql TEXT NOT NULL
);
