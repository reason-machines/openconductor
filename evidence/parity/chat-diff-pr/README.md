# Parity check: chat, diff viewer, PR area

How much of Conductor's chat, diff viewer and PR area exists on main, measured against REA evidence already on main. The current numbers and gap list are in [PARITY.md](PARITY.md).

| File | What it is |
|---|---|
| `features.json` | 41 features (chat 15, diff 14, PR 12). Each has REA evidence anchors (ledger obligation, SQLite column, IPC command, copy-catalog regex, diff library) and per-layer code probes (data, backend, command, ui). |
| `PARITY.md`, `parity.json` | Output of `python3 tools/parity_chat_diff_pr.py`. Do not edit by hand. |
| `rea-compare-summary.json` | Summary of `rea compare-application-versions` between Conductor's frontend Evidence and main. Reproduce with `tools/rea_compare_main.sh`. |

## Rerun

```bash
python3 tools/parity_chat_diff_pr.py --check-anchors   # exits 1 if an evidence anchor stopped resolving
tools/rea_compare_main.sh origin/main                   # needs REA (npm rea-agents) and ~6 GB RAM
```

## Scoring

- A feature's score is the fraction of its layers whose probe matched implementation code (anything outside `evidence/`, `tools/` and `.github/`).
- A feature is `verified` only when `verifications` in `features.json` names a check comparing it with the reference evidence. Strict parity counts only verified features.
- Builders can mark code with a comment `parity:<feature-id>` or `parity:<feature-id>:<layer>` so the checker counts it without relying on regex heuristics.

## Validation of the checker

- Every anchor resolves on main (`--check-anchors` exits 0).
- Positive control: the checker picks up the app shell's placeholder chat panel and composer (ui layers), the chat message model's streaming, tool-use and cancelled-state types (`src-tauri/src/chat/`), and the checkpoint crate's `restore`. It does not count prose matches such as the word "marked" in a comment, because markdown requires a real import.

## REA notes

- `compare-application-versions` matches by node identity, content digest, source map or structural fingerprint. A clean-room rebuild therefore stays near 0 matched even at full feature parity. Use it as a shipped-surface overlap measure, not as the parity number.
- On main @ c60d406, REA pairs 3 nodes by semantic key only: the renderer, the root HTML artifact and a local-storage node. That is shell-level overlap, not chat, diff or PR features.
- Conductor's frontend Evidence is budget-truncated (1,876 limitations), so REA classifies every OpenConductor-only node as `unknown` ("opposite graph is incomplete") instead of `added`.
- `rea <workflow> --schema` still shows only `inputJson: string` in 6.8.0. The real input schema (`left`, `right`) is only in MCP `tools/list`.
- No REA tool compares features across two different implementations: by route, IPC command, persisted column or UI state. `features.json` fills that gap by hand.
- No screen evidence exists (`evidence/screens/` is absent) because native UI capture was denied Screen Recording and Accessibility. Visual parity is unmeasured.
