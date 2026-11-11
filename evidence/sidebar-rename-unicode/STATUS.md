# Hosted rename regression

Conductor Rebuild rechecked this candidate against main `f19879abe8cb4ea3118907c78722ca3e4da3be54` after Home IME PR #1071 merged. The retained original source packet is unchanged. The later requalification is separate in `requalification-f19879ab.json`.

## Baseline milestone

The only app-file change is four additional Rust tests. The new frontend test executes the exact retained pure Conductor helpers and the actual OpenConductor rename plan. Both use the same three NFC-stable names. No validator, dialog, store, persistence, dependency, workflow, timeout, or existing test changes are included.

Static validation passed on Reason cloud:

- `python3 .ara-state/requalify-rename-unicode.py`: 19 retained source bodies, 42 exact source checks, 11 current source pins, and four import/export bindings matched.
- `python3 evidence/sidebar-rename-unicode/verify-fixture.py`: frozen JS, Rust test block, and reference hashes matched. The remaining Rust file equals the baseline.
- `git diff --check`: passed.

The earlier prepared manifest mismatched only `source.json` after a previous metadata requalification. Its original archive copy was recovered with the expected SHA-256 `e9851d7600ffd5d43061629752c74d05c52e1fdeddbb7d471df83f061a7e3176`. No witness or original source bytes changed. This milestone preserves that archived metadata and records the current qualification separately.

Automatic hosted frontend and Tauri jobs will run the new tests. Actual JavaScript acceptance and Rust rejection are not established until those logs are available. The validator fix waits for the intended baseline failure.

## Limits

Local JavaScript, Rust, app, browser, provider, and native execution were not run. No manual workflow dispatch, retry, new executor, or watcher was started. Original and clone native rename, filesystem and database effects, branch rename, installed-package behavior, and visual parity remain unverified. There are no screenshots.
