# Hosted rename regression

Conductor Rebuild rechecked this candidate against main `f19879abe8cb4ea3118907c78722ca3e4da3be54` after Home IME PR #1071 merged. The retained original source packet is unchanged. The later requalification is separate in `requalification-f19879ab.json`.

## Baseline milestone

The only app-file change is four additional Rust tests. The new frontend test executes the exact retained pure Conductor helpers and the actual OpenConductor rename plan. Both use the same three NFC-stable names. No validator, dialog, store, persistence, dependency, workflow, timeout, or existing test changes are included.

Static validation passed on Reason cloud:

- `python3 .ara-state/requalify-rename-unicode.py`: 19 retained source bodies, 42 exact source checks, 11 current source pins, and four import/export bindings matched.
- `python3 evidence/sidebar-rename-unicode/verify-fixture.py`: frozen JS, Rust test block, and reference hashes matched. The remaining Rust file equals the baseline.
- `git diff --check`: passed.

The earlier prepared manifest mismatched only `source.json` after a previous metadata requalification. Its original archive copy was recovered with the expected SHA-256 `e9851d7600ffd5d43061629752c74d05c52e1fdeddbb7d471df83f061a7e3176`. No witness or original source bytes changed. This milestone preserves that archived metadata and records the current qualification separately.

## Executed baseline and focused correction

Hosted run `43088012201`, attached to PR head `95273fda1856d36398e25fac5955a8ad195ff33a`, established the mismatch. The frontend unit job `130757376343` passed all three retained-helper and actual-frontend witnesses plus the ordinary/invalid controls. The macOS Tauri job `130757376387` passed `cargo check --locked --all-targets`, then `cargo test --locked` failed exactly the nonspacing U+0301 and enclosing U+20DD assertions. The spacing-mark witness, invalid controls and existing rename test passed. The Rust suite reported 1,036 passed, two failed and one ignored. Clippy did not run after that failure. See `hosted-red.json`.

Before the correction, all 42 source checks, 19 retained bodies, 11 pins and four bindings were rechecked against main `e752f6cdd53cb235762d8392377c3c608b8b8789`. The correction replaces only the directory-name predicate with the same Unicode Letter/Number/Mark rule, compiled once with strict whole-string anchors. The already-locked `regex` crate becomes a direct dependency. No locked package, version, checksum or transitive edge changes.

The frozen JS/Rust tests and reference files are unchanged. Static fixture, lockfile-graph and diff checks passed. Passing-after JavaScript/Rust execution awaits automatic exact-head CI. No local runtime was used to infer that result.

## Limits

Local JavaScript, Rust, app, browser, provider, and native execution were not run. No manual workflow dispatch, retry, new executor, or watcher was started. Original and clone native rename, filesystem and database effects, branch rename, installed-package behavior, and visual parity remain unverified. There are no screenshots.
