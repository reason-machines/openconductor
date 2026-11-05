-- Composer attachments and inline diff review comments.

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    type TEXT,
    original_name TEXT,
    path TEXT,
    is_loading INTEGER DEFAULT 0,
    session_id TEXT,
    session_message_id TEXT,
    is_draft INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    comment_id TEXT
);

CREATE INDEX idx_attachments_session_id ON attachments(session_id);
CREATE INDEX idx_attachments_session_message_id ON attachments(session_message_id);
CREATE INDEX idx_attachments_is_draft ON attachments(is_draft);

-- created_at / updated_at are integer timestamps here, unlike other tables.
CREATE TABLE diff_comments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    file_path TEXT,
    line_number INTEGER,
    body TEXT,
    state TEXT,
    location TEXT,
    created_at INTEGER NOT NULL,
    remote_url TEXT,
    author TEXT,
    thread_id TEXT,
    reply_to_comment_id TEXT,
    DEPRECATED_update_memory INTEGER,
    updated_at INTEGER,
    author_avatar_url TEXT,
    is_outdated INTEGER,
    is_resolved INTEGER,
    end_line_number INTEGER,
    suggestion_base_code TEXT
);

CREATE INDEX idx_diff_comments_workspace ON diff_comments(workspace_id);
