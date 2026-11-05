# sessions, session_messages, attachments: reference query shapes

Source: the decoded frontend bundle of Conductor 0.87.6
(`/Users/sven/code/conductor-rea-work/frontend/dist/assets/index-BGEQ8YjU.js`
on Sven's Mac, extracted from `/Applications/Conductor.app`; version from
`Info.plist` `CFBundleShortVersionString`). The reference runs this SQL from
the webview through `tauri-plugin-sql`. Read on 2026-11-05 with `perl`
over the bundle after `rea search` refused the file (see
`evidence/rea/rea-invocations.tsv`, rows `sessions_sql_*`).

Whitespace in the literals is collapsed to single spaces. Reference function
names are minified and only identify the bundle location. Only SQL text was
copied; no rows from any live database.

## sessions (`crates/openconductor-db/src/sessions.rs`)

| Rust | Reference literal | Bundle site |
| --- | --- | --- |
| `create` | `INSERT INTO sessions (id, workspace_id, status, claude_session_id, last_user_message_at, agent_type, model, acp_config, permission_mode, codex_thinking_level, agent_personality, fast_mode, claude_effort_level, feed_offset, created_at, updated_at) VALUES (?, ?, 'idle', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, -1, ?, ?)` | `Xet` (createSession); `created_at = updated_at = new Date().toISOString()` |
| `insert_remote_if_missing` | `INSERT OR IGNORE INTO sessions (id, workspace_id, status, claude_session_id, last_user_message_at, agent_type, model, permission_mode, codex_thinking_level, agent_personality, fast_mode, claude_effort_level, remote_archived_at, is_hidden, title, feed_offset, created_at, updated_at) VALUES (?, ?, 'idle', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, -1, ?, ?)` | ensureRemoteSession |
| `get` | `SELECT * FROM sessions WHERE id = ?` | `Wo` |
| `list` | `SELECT * FROM sessions ORDER BY updated_at DESC` | `YZe` |
| `list_for_workspace` | `SELECT * FROM sessions WHERE workspace_id = ?`, then JS: `filter(hidden ? isHidden : !isHidden)`, visible sorted by `Let` (`createdAt - , updatedAt - , id.localeCompare`), hidden by `Qre` (`updatedAt` desc, `createdAt` desc, `id.localeCompare`) | `QZe`, `doGetSessionsForWorkspace`, `Xre`/`Jre`/`Net` |
| row decoding | status in `idle, working, error, needs_plan_response, needs_user_input, needs_user_permission, cancelling, waiting` else throw; permission_mode NULL -> `default`, `default`/`plan` else throw; agent_type `claude, codex, cursor, acp` or NULL; `unread_count === 1`, `freshly_compacted === 1`, `is_hidden === 1`, `fast_mode === 1`; `title ?? "Untitled"`; `feed_offset ?? -1`; `context_token_count \|\| 0` | `JZe`, `ZZe`, `XZe`, `pB` |
| `workspace_id` | `SELECT workspace_id FROM sessions WHERE id = ?` | |
| `ids_for_workspaces` / `delete_for_workspaces` | `SELECT id FROM sessions WHERE workspace_id IN (?,…)` then `DELETE FROM sessions WHERE id IN (?,…)` | `att` (deleteSessionsForWorkspaceIds) |
| `delete` | `DELETE FROM sessions WHERE id = ?` | `ott` |
| `set_status` | `UPDATE sessions SET status = ? WHERE id = ?` | `eet` |
| `set_status_if` | `UPDATE sessions SET status = ? WHERE id = ? AND status = ?` (true when `rowsAffected > 0`) | `tet` |
| `set_claude_session_id` | `UPDATE sessions SET claude_session_id = ? WHERE id = ?` | `set` |
| `apply_mutation` | `UPDATE sessions SET status = CASE WHEN ? THEN ? ELSE status END, claude_session_id = CASE WHEN ? THEN ? ELSE claude_session_id END, permission_mode = CASE WHEN ? THEN ? ELSE permission_mode END, last_user_message_at = CASE WHEN ? IS NOT NULL AND ( last_user_message_at IS NULL OR last_user_message_at < ? ) THEN ? ELSE last_user_message_at END, context_token_count = CASE WHEN ? THEN ? ELSE context_token_count END, context_used_percent = CASE WHEN ? THEN ? ELSE context_used_percent END WHERE id = ?`; skipped when every field is undefined | `xoe` |
| `set_agent_and_model` | `UPDATE sessions SET agent_type = ?, model = ?, fast_mode = ?${u} WHERE id = ?` (with `${u}` empty) | `uet` |
| `set_thinking_level` | `UPDATE sessions SET ${n.column} = ? WHERE id = ?`; column from `k_`: claude -> `claude_effort_level`, codex/cursor -> `codex_thinking_level`, acp -> none | `fet`, `k_` |
| `set_fast_mode` | `UPDATE sessions SET fast_mode = ? WHERE id = ?` | |
| `set_agent_personality` | `UPDATE sessions SET agent_personality = ? WHERE id = ?` | |
| `set_title` | `UPDATE sessions SET title = ? WHERE id = ?` | `wet` |
| `set_unread` | `UPDATE sessions SET unread_count = ? WHERE id = ?` (`unread ? 1 : 0`) | `ret` |
| `mark_workspace_read` | `SELECT id from sessions WHERE workspace_id = ? AND unread_count = 1` then `UPDATE sessions SET unread_count = 0 WHERE workspace_id = ? AND unread_count = 1` | `ntt` |
| `set_freshly_compacted` | `UPDATE sessions SET freshly_compacted = ? WHERE id = ?` | `iet` |
| `set_resume_session_at` | `UPDATE sessions SET resume_session_at = ? WHERE id = ?` | `oet` |
| `set_context_usage` | `UPDATE sessions SET context_used_percent = COALESCE(?, context_used_percent), context_token_count = COALESCE(?, context_token_count) WHERE id = ?`; skipped when both undefined | `_et` |
| `set_last_user_message_at` | `UPDATE sessions SET last_user_message_at = ? WHERE id = ?` | `rtt` |
| `bump_last_user_message_at` | `UPDATE sessions SET last_user_message_at = MAX(COALESCE(last_user_message_at, ?), ?) WHERE id = ?` | `itt` |
| `set_feed_offset` | `UPDATE sessions SET feed_offset = ? WHERE id = ?` (`offset ?? -1`) | |
| `hide` / `unhide` | `UPDATE sessions SET is_hidden = 1 WHERE id = ?` / `UPDATE sessions SET is_hidden = 0 WHERE id = ?` | `nie`, `Met`, `Oet` |
| `is_hidden` | `SELECT is_hidden FROM sessions WHERE id = ?` | |
| `reset_busy_to_idle_in_workspace` | `SELECT id FROM sessions WHERE workspace_id = ? AND (Cet)` then `UPDATE sessions SET status = 'idle' WHERE workspace_id = ? AND (Cet)`; `Cet` = working, needs_plan_response, cancelling, needs_user_input, needs_user_permission, waiting | `Pet` |
| `reset_busy_to_idle_at_startup` | `SELECT id FROM sessions WHERE (Ret) AND EXISTS ( SELECT 1 FROM workspaces WHERE workspaces.local_id = sessions.workspace_id AND ( workspaces.hosting_server_url IS NULL OR workspaces.hosting_server_url = '' OR workspaces.hosting_server_url = '/' ) )` then `UPDATE sessions SET status = 'idle' WHERE id IN (<that select>)`; `Ret` = `Cet` without needs_user_input | `xet` |

## session_messages (`crates/openconductor-db/src/session_messages.rs`)

| Rust | Reference literal | Bundle site |
| --- | --- | --- |
| `insert` | `INSERT INTO session_messages ( id, session_id, role, content, sent_at, created_at, full_message, model, sdk_message_id, turn_id, last_assistant_message_id, is_resumable_message, queue_order, sender_id, sender_session_id, sender_api_key_name ) VALUES ( ?, … 16 ? )`; `is_resumable_message` bound as `isResumableMessage ? 1 : null` | `vie`, `Mb` |
| `upsert` | same insert `ON CONFLICT(id) DO UPDATE SET content = excluded.content, sent_at = excluded.sent_at, turn_id = excluded.turn_id, queue_order = excluded.queue_order WHERE session_messages.session_id = excluded.session_id AND session_messages.role = excluded.role` (returns `rowsAffected`) | `nst` |
| `get` | `SELECT * FROM session_messages WHERE id = ? LIMIT 1` | `Pst` |
| `list_sent` | `SELECT * FROM session_messages WHERE session_id = ? AND sent_at IS NOT NULL ORDER BY sent_at` | `Fst` |
| `list_sent_from` | `SELECT ${cols}, ${revision} FROM session_messages WHERE session_id = ? AND sent_at IS NOT NULL ORDER BY sent_at LIMIT -1 OFFSET ?` (primary-DB branch: order `sent_at`) | `getMessages` incremental path |
| `transcript_revision` | `COALESCE(( SELECT MAX(rowid) FROM session_messages WHERE session_id = ? AND sent_at IS NOT NULL ), 0) AS transcript_revision` | same |
| `list_queued` | `SELECT * FROM session_messages WHERE session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL ORDER BY COALESCE(queue_order, 0), created_at, id` | `CP` |
| `next_queue_order` | `SELECT COALESCE(MAX(queue_order), 0) + 1 AS next FROM session_messages WHERE session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL` (`?? 1`) | `rst` |
| `queue_state` | `SELECT (SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND role = 'user' AND sent_at IS NULL AND cancelled_at IS NULL) AS queued_message_count, COALESCE((SELECT context_token_count FROM sessions WHERE id = ?), 0) AS context_token_count, (SELECT model FROM sessions WHERE id = ?) AS model` | |
| `mark_sent` | `UPDATE session_messages SET sent_at = ?, last_assistant_message_id = ?, turn_id = ? WHERE id = ? AND session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL${l}` with `l = expectedContent === undefined ? "" : " AND content = ?"`; `turn_id = turnId ?? id`; false when `rowsAffected === 0` | `Mst` (markQueuedMessageAsSent) |
| `requeue` | `UPDATE session_messages SET sent_at = NULL, turn_id = NULL, last_assistant_message_id = NULL, queue_order = ( SELECT COALESCE(MAX(queue_order), 0) + 1 FROM session_messages WHERE session_id = ? AND sent_at IS NULL AND cancelled_at IS NULL ) WHERE id = ? AND session_id = ? AND sent_at = ? AND cancelled_at IS NULL` | |
| `clear_queue_order` | `UPDATE session_messages SET queue_order = NULL WHERE session_id = ? AND id IN (SELECT value FROM json_each(?)) AND queue_order = ?` | |
| `update_content` | `UPDATE session_messages SET content = ?, turn_id = ? WHERE id = ? AND session_id = ?` | |
| `adopt_own_turn` | `UPDATE session_messages SET turn_id = id WHERE id = ? AND session_id = ? AND role = 'user' AND sent_at IS NOT NULL AND turn_id IS NULL` | |
| `mark_compacted` | `UPDATE session_messages SET last_assistant_message_id = ? WHERE session_id = ?` bound to `sy = "compacted"` | `Ost` (clearAssistantMessageIds) |
| `delete_after` | `DELETE FROM session_messages WHERE session_id = ? AND COALESCE(sent_at, cancelled_at) > ?` | `Fst` (deleteMessagesAfterWatermark) |
| `latest_assistant_sdk_message_id` | `SELECT sdk_message_id FROM session_messages WHERE session_id = ? AND role = 'assistant' AND sdk_message_id IS NOT NULL AND sent_at IS NOT NULL ORDER BY sent_at DESC, created_at DESC LIMIT 1` | `ist` |
| `assistant_id_by_sdk_message_id` | `SELECT id FROM session_messages WHERE session_id = ? AND role = 'assistant' AND sdk_message_id = ? LIMIT 1` | |
| `assistant_id_by_turn_content` | `SELECT id FROM session_messages WHERE session_id = ? AND role = 'assistant' AND turn_id = ? AND content = ? LIMIT 1` | |
| `current_turn_id` | `SELECT turn_id AS id FROM session_messages WHERE session_id = ? AND role = 'user' AND (sent_at IS NOT NULL OR cancelled_at IS NOT NULL) ORDER BY COALESCE(sent_at, cancelled_at) DESC LIMIT 1` | |
| `turn_exists` | `SELECT turn_id AS id FROM session_messages WHERE session_id = ? AND role = 'user' AND turn_id = ? AND (sent_at IS NOT NULL OR cancelled_at IS NOT NULL) LIMIT 1` | |

Not found: any statement that writes `cancelled_at` (searched every asset
`*.js`, the `MacOS/conductor` strings and the `conductor-runtime` strings;
only the migration that adds the column, readers and the cache.db mirror's
`INSERT OR REPLACE` mention it). No statement filters on
`is_resumable_message`; it is only stored and decoded (`=== 1`).

## attachments (`crates/openconductor-db/src/attachments.rs`)

| Rust | Reference literal | Bundle site |
| --- | --- | --- |
| `create` | `INSERT INTO attachments ( id, type, original_name, path, is_loading, is_draft, session_id, session_message_id, comment_id ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` | `createAttachment` |
| `get` | `SELECT * FROM attachments WHERE id = ? AND session_id = ? LIMIT 1` | `getAttachment` |
| `list_for_message` | `SELECT * FROM attachments WHERE session_message_id = ? ORDER BY created_at ASC` | `getAttachmentsForMessage` |
| `list_for_session` | `SELECT * FROM attachments WHERE session_id = ? OR session_message_id IN ( SELECT id FROM session_messages WHERE session_id = ? ) ORDER BY created_at ASC` | `getAttachmentsForSession` |
| `list_sent_for_session` | `SELECT * FROM attachments WHERE is_draft = 0 AND ( session_id = ? OR session_message_id IN ( SELECT id FROM session_messages WHERE session_id = ? ) ) ORDER BY created_at ASC` | |
| `list_drafts` | `SELECT * FROM attachments WHERE session_id = ? AND is_draft = 1 ORDER BY created_at ASC` | `getDraftAttachments` |
| `retarget_drafts` | `UPDATE attachments SET session_id = ? WHERE session_id = ? AND is_draft = 1 AND id IN (…)`; skipped when source = target or no ids | `retargetDraftAttachments` |
| `finalize_path` | `UPDATE attachments SET path = ?, is_loading = 0 WHERE id = ? AND session_id = ?` (`rowsAffected > 0`) | `finalizeAttachmentPath` |
| `delete` | `DELETE FROM attachments WHERE id = ? AND session_id = ?${onlyDraft ? " AND is_draft = 1" : ""} RETURNING *` | `deleteAttachment` |
| `mark_drafts_sent` | ids given: `UPDATE attachments SET session_message_id = ?, is_draft = 0 WHERE session_id = ? AND is_draft = 1 AND id IN (…)` (only when non-empty), then `DELETE FROM attachments WHERE session_id = ? AND session_message_id = ?${ids.length === 0 ? "" : " AND id NOT IN (…)"}`; no ids: `UPDATE attachments SET session_message_id = ?, is_draft = 0 WHERE session_id = ? AND is_draft = 1` | `markDraftAttachmentsAsSent` |
| `restore_to_draft` | `UPDATE attachments SET session_message_id = NULL, is_draft = 1 WHERE session_id = ? AND session_message_id = ?` | `restoreMessageAttachmentsToDraft` |
| `session_ids_for_comment` | `SELECT DISTINCT session_id FROM attachments WHERE comment_id = ?` | `getReviewCommentSessionIds` |
| `comment_ids_for_messages` | `SELECT DISTINCT comment_id FROM attachments WHERE session_id = ? AND session_message_id IN (…) AND comment_id IS NOT NULL` | markReviewAttachmentsForMessagesAsReviewed |
