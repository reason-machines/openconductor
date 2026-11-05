-- Mirror of each session's queued (not yet delivered) messages.

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
