-- Outboxes for messages and assets waiting to be delivered or uploaded,
-- with per-session pause state.

CREATE TABLE session_messages_outbox (
    message_id TEXT PRIMARY KEY,
    session_id TEXT,
    delivery_payload TEXT,
    config TEXT,
    mode TEXT,
    asset_ids TEXT,
    queue_order INTEGER,
    state TEXT,
    send_attempt_count INTEGER DEFAULT 0,
    next_send_attempt_at TEXT,
    last_error TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX idx_session_messages_outbox_session
    ON session_messages_outbox(session_id, created_at);
CREATE INDEX idx_session_messages_outbox_due
    ON session_messages_outbox(state, next_send_attempt_at);
CREATE INDEX idx_session_messages_outbox_order
    ON session_messages_outbox(session_id, queue_order, created_at);

CREATE TABLE session_messages_outbox_state (
    session_id TEXT,
    paused_at TEXT,
    updated_at TEXT
);

CREATE UNIQUE INDEX idx_session_messages_outbox_state_session
    ON session_messages_outbox_state(session_id);

CREATE TABLE session_assets_outbox (
    attachment_id TEXT PRIMARY KEY,
    message_id TEXT,
    source_ref TEXT,
    original_name TEXT,
    state TEXT,
    upload_attempt_count INTEGER DEFAULT 0,
    next_upload_attempt_at TEXT,
    last_error TEXT,
    created_at TEXT,
    updated_at TEXT,
    asset_id TEXT,
    relative_path TEXT
);

CREATE INDEX idx_session_assets_outbox_message
    ON session_assets_outbox(message_id, created_at);
CREATE INDEX idx_session_assets_outbox_due
    ON session_assets_outbox(state, next_upload_attempt_at);
