CREATE TABLE _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
);
CREATE TABLE session_messages (
                id TEXT,
                sdk_message_id TEXT,
                last_assistant_message_id TEXT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                created_at TEXT,
                turn_id TEXT,
                sent_at TEXT,
                full_message TEXT,
                cancelled_at TEXT,
                model TEXT,
                is_resumable_message INTEGER,
                queue_order INTEGER,
                sender_id TEXT,
                sender_session_id TEXT,
                sender_api_key_name TEXT,
                source_rowid INTEGER
            );
CREATE INDEX idx_client_cache_session_messages_session_sent
                ON session_messages(session_id, sent_at);
CREATE UNIQUE INDEX idx_client_cache_session_messages_id
                ON session_messages(id);
CREATE TABLE client_cache_session_state (
                session_id TEXT,
                feed_offset INTEGER,
                primary_max_rowid INTEGER,
                primary_message_count INTEGER,
                cache_version INTEGER,
                cache_revision INTEGER,
                first_written_at TEXT,
                last_modified_at TEXT,
                last_read_at TEXT
            );
CREATE UNIQUE INDEX idx_client_cache_session_state_session_id
                ON client_cache_session_state(session_id);
CREATE TABLE session_pending_messages_state (
                session_id TEXT,
                generation INTEGER,
                paused INTEGER,
                snapshot_at TEXT,
                cache_version INTEGER
            );
CREATE UNIQUE INDEX idx_session_pending_messages_state_session
                ON session_pending_messages_state(session_id);
CREATE TABLE session_pending_messages (
                session_id TEXT,
                message_id TEXT,
                delivery_payload TEXT,
                config TEXT,
                mode TEXT,
                position INTEGER,
                revision INTEGER,
                sender_id TEXT,
                received_at TEXT,
                generation INTEGER
            );
CREATE UNIQUE INDEX idx_session_pending_messages_id
                ON session_pending_messages(message_id);
CREATE INDEX idx_session_pending_messages_session
                ON session_pending_messages(session_id, position);
CREATE TABLE navigation_sections (
                id TEXT PRIMARY KEY,
                hosting_server_url TEXT,
                organization_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            , emoji TEXT);
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
