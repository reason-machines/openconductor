# @openconductor/chat

Chat transcript model and message rendering for OpenConductor.

## Transcript model (`src/transcript.ts`)

`reduceTranscript(transcript, event)` folds two input streams into a render model of user messages, inbound reports, assistant messages (text, thinking, tool calls) and notices:

- Agent SDK messages (`system`, `stream_event`, `assistant`, `user`, `result`). Conductor keeps these in `session_messages.full_message` with an `sdk_message_id` ([schema](../../evidence/sqlite/conductor.schema.sql)).
- Conductor-layer events: `local/user_send` (the person's composer), `local/inbound` (a message another session or an API key posted into this chat), `local/interrupted`.

`fromRows(rows, sessionId)` hydrates a transcript from `session_messages` rows.

Rules the model enforces:

- The person's messages come only from Conductor's own log. SDK `user` messages are agent echoes (tool results, subagent prompts, injected text) and never become user bubbles.
- A row with a foreign `sender_session_id` or a `sender_api_key_name` is an inbound report, not user input. Other sessions post with `conductor message create --session <id>` ([CLI help](../../evidence/runtime/conductor-cli-help.txt)); the app labels these "sent from another session".
- An inbound report that arrives mid-turn is placed between the agent's messages. It does not end the turn, close the stream or enable retry.
- Activity with a `parent_tool_use_id` nests under the tool call that started the subagent.
- Queued messages stay in `transcript.queue` until sent, so the running turn stays contiguous.

## Actions (`src/actions.ts`)

`messageText` (copy message), `finalMessageText` (copy the turn's final message), `retryTarget` (the user message a retry resends), `toolSummary` (collapsed tool row label) and `transcriptToMarkdown` (full or concise transcript copy).

## Checks

```bash
npm ci
npm run typecheck
npm test
```
