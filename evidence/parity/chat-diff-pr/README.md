# Parity check: chat, diff viewer, PR area

How much of Conductor's chat, diff viewer and PR area exists on main, measured against REA evidence already on main. The current numbers and gap list are in [PARITY.md](PARITY.md).

| File | What it is |
|---|---|
| `features.json` | 41 features (chat 15, diff 14, PR 12). Each has REA evidence anchors (ledger obligation, SQLite column, IPC command, copy-catalog regex, diff library) and per-layer code probes (data, backend, command, ui). |
| `reviews.json` | Hand-reviewed verdict per feature at a pinned commit: verdict, finding and builder obligation, plus the obligation issue per area. This is the parity number. |
| `screens/` | Our Vite build captured with REA `capture-browser-scenario` in the `evidence/screens` setup, and `screens.json` with REA `compare-web-screenshots` results against the references. |
| `PARITY.md`, `parity.json` | Output of `python3 tools/parity_chat_diff_pr.py`. Do not edit by hand. |
| `rea-compare-summary.json` | Summary of `rea compare-application-versions` between Conductor's frontend Evidence and main. Reproduce with `tools/rea_compare_main.sh`. |

## Rerun

```bash
python3 tools/parity_chat_diff_pr.py --check-anchors   # exits 1 if an evidence anchor stopped resolving
npm ci && npx vite build && TMPDIR=/tmp/t node tools/parity_chat_diff_pr_screens.mjs   # needs REA and Chromium
tools/rea_compare_main.sh origin/main                   # needs REA (npm rea-agents) and ~6 GB RAM
```

## Scoring

- Parity is the mean reviewed verdict from `reviews.json`: implemented 1 (works in the running app and matches the reference), partial 0.5 (reachable but incomplete), unwired or backend-only 0.25 (code exists but the running app never reaches it with real data), missing 0 (absent or schema only). The same weights as the sidebar/Home/create verifier.
- The code-layer score (regex probes plus `parity:<feature-id>[:<layer>]` tags) is reported beside it as a heuristic only. Tags are claims by builders; a verdict overrides them. On main @ 884f1f7 the heuristic said 43.7% and the review 14.6%: for example `diff.virtualized` was tagged on a component that renders every row.
- A feature whose probe-matched files changed since `reviewed_at` is flagged "code changed since review" until a verifier rereads it and bumps `reviewed_at`. A feature's own `reviewed_at` in `reviews.json` overrides the file-level one, so one area can be re-read without claiming the others were.
- A feature is `verified` only when `verifications` in `features.json` names a check comparing it with the reference evidence. Strict parity counts only verified features.

## REA notes

- `compare-application-versions` matches by node identity, content digest, source map or structural fingerprint. A clean-room rebuild therefore stays near 0 matched even at full feature parity. Use it as a shipped-surface overlap measure, not as the parity number.
- On main @ c60d406, REA pairs 3 nodes by semantic key only: the renderer, the root HTML artifact and a local-storage node. That is shell-level overlap, not chat, diff or PR features.
- Conductor's frontend Evidence is budget-truncated (1,876 limitations), so REA classifies every OpenConductor-only node as `unknown` ("opposite graph is incomplete") instead of `added`.
- `rea <workflow> --schema` still shows only `inputJson: string` in 6.8.0. The real input schema (`left`, `right`) is only in MCP `tools/list`.
- No REA tool compares features across two different implementations: by route, IPC command, persisted column or UI state. `features.json` fills that gap by hand.
- Reference screens now exist (`evidence/screens`, captured from Conductor's extracted frontend in Chromium, not from the native app). Native UI capture on the Mac is still refused Screen Recording and Accessibility, so WKWebView rendering and native chrome stay unmeasured.
- `compare-web-screenshots` reports only a changed-pixel count and ratio, with no region breakdown, so it cannot say which panel differs; the per-feature findings come from reading the captures.
- `capture-browser-scenario` (6.8.0) fails the whole capture when one `click` locator matches nothing: it returns `execution_failure` with "Run `rea doctor`", a `cleanup_incomplete` error, no step-level error naming the locator and no partial screenshot. Seen at main `85e00bb`, where the split shot clicked a toolbar button that had moved into the file tab; found by bisecting the actions by hand.
- `rea search` (6.7.0) has no string search over a JavaScript file: on Conductor's bundle chunks it returns `capability_unavailable` / `target_unsupported`, because every `auto` backend (ghidra, hopper, ida, kuna) rejects a JS artifact (`evidence/rea/search_strings_js_comments.error.json`). With `analyze-javascript-application` also out of reach for `renderApp` (worker heap exhausted at 16 GB), the diff findings for edit-in-viewer (#362) and comments to chat / GitHub comments (#378) come from plain-text Python searches of the extracted 0.87.6 bundle on sven m5 max (`evidence/diff/edit-in-viewer.md`, `evidence/diff/comments-to-chat.md`).
- `rea trace <bundle.js> --query=…` (6.7.0, the build on sven m5 max) goes through the same `search_strings` operation and fails the same way on `renderApp-D_fmY7hW.js`: `capability_unavailable`, category `unsupported_provider`, `selection_reason: target_unsupported`, every candidate (ghidra, hopper, ida, kuna) rejected; Ghidra additionally reports `not_configured` (no `GHIDRA_INSTALL_DIR`, no Java runtime on that Mac). Reproduced 2026-11-05 with `--query='Fork to new tab'`. So the Fork to new tab review (#445, `fork.md`) also rests on plain-text reads of the bundle (sha256 `5199d392…`), rechecked here for the turn menu items and the error strings.
- The chat capture's fixture (`ours-chat--transcript`) shows a turn still running, so turn-footer changes (More actions, Fork to new tab, the hover) are not in any capture.
- `capture-browser-scenario --schema` and MCP `tools/list` give `actions` as an untyped array; the action vocabulary (`click`, `fill`, `press`, `wait_for`, `wait_for_timeout`) was taken from the existing shot files.
