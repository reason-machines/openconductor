# Apply Chrome-mode changes to an existing Claude chat

Owner: Conductor Rebuild / Settings SAME49. Baseline: main
`eef01e9b287472280fb3f4a585bc697d5f1f8f51` (2026-11-17).

## Retained reference and defect

The existing Conductor 0.87.6 Bun source is 13,025,924 bytes, SHA-256
`f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab`.
A read-only confined OpenSSL digest on Sven's Mac verified that complete hash in
this repair. Direct file reads supplied bounded inert spans; no original code
was evaluated, no acquisition occurred, and no app or provider ran. The exact
embedded-byte/REA-subject binding is inherited from
[the Auto-policy reference](../auto-permission/reference.json), not remeasured.

[reference.json](reference.json) pins the complete `Ln4` policy at UTF-8 bytes
[3507564,3508680), SHA-256
`84781653d6c5b6b714b3894522864da8755f2523d3784c73b8e21d7bcecbfdf2`.
It marks `chromeEnabled` as `recreate`. The complete `WB5`/`Pc3`/`An4` helper
span identifies changed recreation keys. Previously retained same-build `BT4`,
`gp5`, schema, `CB5`, and runner-message/warm spans join query options to that
policy and resume/recreate before the next eligible message. The new SDK-option
excerpt maps enabled Chrome to `extraArgs.chrome`; it is not the whole generator.

Main reads the saved Chrome preference only in the launcher. `ensure_live`
returns early when the current `ChatOptions` equal the prior options, and those
options contain no Chrome snapshot. Thus toggling Chrome between turns does not
invalidate an otherwise unchanged live generator. This is distinct from #1405's
Auto permission policy.

## Smallest complete repair

`claude_prompt` reads the existing typed preference each turn into an internal
`ChatOptions.chrome_enabled` snapshot. `#[serde(skip)]` prevents chat IPC values
from selecting it. A read error returns before dispatch rather than reusing an
unknown policy. The existing equality/restart path now notices either toggle
direction, preserves the observed resume identity and busy-turn guard, and sets
`launch.chrome` from that snapshot before spawn. The existing launch-time read
remains a fallback for callers without a snapshot. No global setting schema,
provider path, permission selector, frontend or persistence format changes.

## Reproduction and checks

```bash
python3 evidence/settings/chrome-reconcile/run-probe.py --source-ref eef01e9b287472280fb3f4a585bc697d5f1f8f51
python3 evidence/settings/chrome-reconcile/run-probe.py
python3 evidence/settings/chrome-reconcile/verify-reference.py
python3 evidence/settings/auto-permission/verify-reference.py
python3 evidence/settings/auto-permission/run-tests.py
python3 evidence/settings/auto-permission/run-tests.py --filter interact_tests::
python3 evidence/settings/auto-permission/run-tests.py --filter agent::claude_stream::tests::
python3 evidence/settings/auto-permission/run-tests.py --filter launch_policy_case::
git diff --check
```

The unchanged nine-case fixture compiled on baseline, then produced **4 pass /
5 assertion failures** ([raw RED log](red.log.gz)). Both toggle directions failed to
restart; changed-policy busy handling, authoritative first-launch snapshot and
preference-error propagation also lacked the new wiring. The latter three are
boundary controls, not separately observed native defects. The identical frozen
nine cases pass on the repair, along with two permanent pure option tests:
**11/11 pass** ([raw GREEN log](green.log.gz)). Logs are stored as lossless gzip to preserve their original whitespace. Fixture SHA-256 remains
`f3c262c066bbb5dd717ccb6d10b4e04767130148908cf900e5eb5dfc1a148f9b`.

The probe copies the real `ChatOptions` and real `ensure_live` prefix, stopping
immediately before `ClaudeSession::spawn`. Its documented mechanical transforms
return the prepared launch or reuse outcome. Kill/wait are counters, the mapper
is a DTO, and the preference reader is an immediate synthetic bool/error adapter;
no stand-in executable, subprocess session, DB or provider is used. Source and
adapter identities are retained in the baseline/candidate manifests. This proves
the exercised data/control flow, not a full Tauri command or session integration.

Adjacent pure checks passed: Auto/Plan policy and protocol **13/13**, interactions
**7/7**, stream protocol **6/6**, and launch matrix **1/1**. Source guards also
confirm six protected production files are byte-identical to baseline, including
the existing Auto selector, approval protocol, typed preference reader and Codex
entry point. That is a static non-Claude control, not non-Claude runtime testing.

## Acceptance gaps and REA limits

Full Tauri compilation, actual SQLite reads, live CLI restart/resume/reuse,
Chrome extension integration, package containment, installed identity and native
behavior were **not run**. No screenshot exists because no visible app/runtime
execution was authorized. Ordinary automatic CI supplies only the checks that
actually execute; skipped/manual Rust workflows are not claimed as passes.
Existing package/native owners and all E1/runtime holds remain unchanged.

No new REA operation was invoked. The existing Bun extraction/semantic-coverage
gap remains: this uses exact retained source, not observed runtime behavior.
