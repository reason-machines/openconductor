# SQLite schema (Wave 0, area 4)

Source: APFS clones (`cp -c`) of the live `conductor.db`, `cache.db` and their WAL/SHM in `~/Library/Application Support/com.conductor.app`. The running app was not touched. Only DDL, the `_sqlx_migrations` table and aggregate row counts were taken; no user rows.

REA `inspect-sqlite-database` refuses inputs over 256 MiB (both DBs are ~7 GB), so it was run on schema-only snapshots built from the clones (`sqlite3 .schema` into an empty DB, plus the `_sqlx_migrations` rows). Gap recorded in the REA test report.

Files:
- `conductor.schema.sql`, `cache.schema.sql` - full DDL.
- `rea-inspect-sqlite-*-schema.json` - REA Evidence (`--schema-scope database`).
- `rea-inspect-sqlite-*-migrations.json` - REA Evidence of migration version/description (conductor: 139 rows, max version 142; cache: 6).
- `row-counts.md` - aggregate counts.

Observations:
- Migrations are sqlx (`_sqlx_migrations`), matching `sqlx-sqlite-0.8.6` in the binary; `tauri-plugin-sql` is also linked.
- Entities: repos -> workspaces (git worktrees; `repository_id`, `branch`, `directory_name`, `state`, `derived_status`, PR title/description, archive commit) -> sessions -> session_messages (`role`, `content`, `full_message` JSON, `model`, `turn_id`, `sdk_message_id`, queue order).
- `cache.db` mirrors `session_messages` (1,666,797 vs 1,666,798 rows) plus client cache state and pending-message queue.
- No checkpoints table: checkpoints are git commits under `refs/conductor-checkpoints/<id>` written by `bin/checkpointer.sh` (see `evidence/scripts`).
- Other persisted state is JSON next to the DBs: `local-storage.subsystem.*.json` (browser-local-storage claude-context-windows composer-drafts dispatcher-state model-picker-configs-v1 opencode-model-discovery-v1 pre-workspace-completions-v1 route-user-state run-script-history terminal turn-changes-cache ), `.window-state.json` (tauri-plugin-window-state), `draft-attachments/`, `sidecar-v2-session-event-outbox/`, `sidecar-v2-completions/`, `terminal-shell-integration/`, `agent-binaries/`. Names only; contents not copied.

## conductor.db tables and columns
- `_sqlx_migrations`: version, description, installed_on, success, checksum, execution_time
- `attachments`: id, type, original_name, path, is_loading, session_id, session_message_id, is_draft, created_at, comment_id
- `diff_comments`: id, workspace_id, file_path, line_number, body, state, location, created_at, remote_url, author, thread_id, reply_to_comment_id, DEPRECATED_update_memory, updated_at, author_avatar_url, is_outdated, is_resolved, end_line_number, suggestion_base_code
- `env_vars`: key, scope, context, value
- `favorite_models`: organization_id, user_id, id, position, configuration, created_at
- `migration_rollbacks`: version, down_sql
- `navigation_section_memberships`: id, section_id, workspace_id, created_at
- `navigation_sections`: id, organization_id, user_id, name, icon_name, sort_order, created_at, updated_at, emoji
- `port_forwards`: id, workspace_id, remote_port, local_port, protocol, label, enabled, created_at, auto_detected
- `repos`: id, remote_url, name, default_branch, root_path, setup_script, created_at, updated_at, storage_version, archive_script, display_order, run_script, run_script_mode, remote, custom_prompt_code_review, custom_prompt_create_pr, custom_prompt_rename_branch, conductor_config, custom_prompt_general, icon, hidden, custom_prompt_fix_errors, custom_prompt_resolve_merge_conflicts, file_include_globs, spotlight_testing
- `session_assets_outbox`: attachment_id, message_id, source_ref, original_name, state, upload_attempt_count, next_upload_attempt_at, last_error, created_at, updated_at, asset_id, relative_path
- `session_messages`: id, session_id, role, content, created_at, sent_at, full_message, cancelled_at, model, sdk_message_id, last_assistant_message_id, turn_id, is_resumable_message, queue_order, sender_id, sender_session_id, sender_api_key_name
- `session_messages_outbox`: message_id, session_id, delivery_payload, config, mode, asset_ids, queue_order, state, send_attempt_count, next_send_attempt_at, last_error, created_at, updated_at
- `session_messages_outbox_state`: session_id, paused_at, updated_at
- `sessions`: id, status, claude_session_id, unread_count, freshly_compacted, context_token_count, created_at, updated_at, is_compacting, model, permission_mode, DEPRECATED_thinking_level, last_user_message_at, resume_session_at, workspace_id, is_hidden, agent_type, title, context_used_percent, DEPRECATED_thinking_enabled, codex_thinking_level, fast_mode, agent_personality, claude_effort_level, feed_offset, queue_paused_at, remote_archived_at, acp_config
- `settings`: key, value, created_at, updated_at, deprecated_at
- `symlinks_pending_deletion`: path
- `terminal_sessions`: session_id, workspace_id, started_at, ended_at, cwd, cols, rows, rehydrate_sequences, alternate_screen, bracketed_paste, has_received_user_input
- `workspaces`: local_id, repository_id, DEPRECATED_city_name, directory_name, DEPRECATED_archived, active_session_id, branch, created_at, updated_at, unread, placeholder_branch_name, state, initialization_parent_branch, big_terminal_mode, setup_log_path, initialization_log_path, initialization_files_copied, pinned_at, linked_workspace_ids, notes, intended_target_branch, manual_status, derived_status, archive_commit, pr_title, pr_description, secondary_directory_name, linked_directory_paths, hosting_server_url, sandbox_provider, workspace_path, user_set_workspace_name, user_set_branch_name, workspace_name, permission_level, creator_user_id, remote_file_sync_enabled, creator_client_id, organization_id, assignee_user_id, watcher_user_ids, workspace_template_id, is_computer_admin, auto_forward_enabled, restricted, access_level, number, port_forwarding_enabled, id, description

## cache.db tables and columns
- `_sqlx_migrations`: version, description, installed_on, success, checksum, execution_time
- `client_cache_session_state`: session_id, feed_offset, primary_max_rowid, primary_message_count, cache_version, cache_revision, first_written_at, last_modified_at, last_read_at
- `favorite_models`: hosting_server_url, organization_id, user_id, id, position, configuration, created_at
- `navigation_section_memberships`: id, section_id, workspace_id, created_at
- `navigation_sections`: id, hosting_server_url, organization_id, user_id, name, sort_order, created_at, updated_at, emoji
- `session_messages`: id, sdk_message_id, last_assistant_message_id, session_id, role, content, created_at, turn_id, sent_at, full_message, cancelled_at, model, is_resumable_message, queue_order, sender_id, sender_session_id, sender_api_key_name, source_rowid
- `session_pending_messages`: session_id, message_id, delivery_payload, config, mode, position, revision, sender_id, received_at, generation
- `session_pending_messages_state`: session_id, generation, paused, snapshot_at, cache_version
