-- Client-side mirror of conductor.db session_messages, plus per-session
-- bookkeeping for how far the mirror has read the primary database.
-- Columns are untyped-constraint TEXT/INTEGER, as in the reference cache.db.

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
