# A model pick in a running chat: reference behaviour

Ledger: `chat.model-picker` (#271). Source: Conductor 0.87.6 on sven m5 max,
read 2026-11-05. Everything below is untrusted data, described in our own
words. REA could not trace either file (evidence/chat/rea-gaps.md item 10);
rows `model_live_trace`, `model_live_bundle_read` in
evidence/rea/rea-invocations.tsv.

## Conductor

- The composer's model pick runs the `updateSessionModel` mutation
  (`index-BGEQ8YjU.js` @3,152,847): it writes `sessions.model` (and the
  agent type and thinking column, @1,110,274) and reloads the session. It
  does not start a new agent session.
- The ACP runner (`conductor-runtime`, `AcpAgentRunner`) applies it to the
  live agent session: `reconcileSessionConfig` (@63,660,263) compares the
  session's model with the model last applied (`appliedModel`) and, when
  they differ, sends `session/set_config_option` on the same ACP session.
  It runs before every prompt (@63,658,766), when a session is created
  (@63,681,902), and from `setSessionModelIfIdle` (@63,675,741), which
  defers while a turn runs.

## OpenConductor (this change)

- `configure` on a chat whose Reason Session is open calls the backend's
  `reconfigure`; Reason's is `reason_set_config`, which updates the
  provider's wanted options.
- Before each prompt the provider compares the wanted options with those
  last set on the Session and sends `session/set_config_option` for the
  ones that changed (unoffered values become notices, as at creation). A
  resumed Session gets them before its first prompt too, which also closes
  the "config is not re-applied on session/resume" gap.
- A follow-up that steers a running turn leaves a changed pick for the
  prompt after it, as Conductor defers while a turn runs.

Tests: `provider_tests::a_changed_config_applies_to_the_open_session_at_its_next_prompt`
(fake `reason acp`: switch, resume, unoffered value) and chatRuntime.test.ts
"a pick in a chat whose session is open goes to that session".
