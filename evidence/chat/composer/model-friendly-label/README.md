# Local chat model friendly-label baseline

Conductor Rebuild prepared five mounted regression cases against main `47463ddaf959a7ee394d3d64a5b22e3eccbda74c`. This is a test-only baseline. The suspected formatter defect has not yet been reproduced by execution, and no product repair is included.

## Bounded source finding

The retained Conductor source accepts a known local Claude model such as `opus-4-8`, retains it when the offered catalog omits it, and labels it `Opus 4.8`. OpenConductor also retains the current model. Its `ChatModelPicker` supplies `reasonModelName` for every agent, overriding `ModelPicker`'s existing local display table with the raw Claude ID.

The source packet originally pinned main `838ab2a1c76d11f8048a89c9d4c01ba822db2204`. All ten source snapshots were compared with the current checkout and remain byte-identical at the newer baseline above. `baseline.json` records those hashes and the frozen fixture hash. The original 87,221-byte packet is retained unchanged as `source-packet.tar.gz`, with SHA-256 `5aaaa93a98590aa9ba911b593b115dfa10e35ea1e52ac85783d64a5e7cb7bbf0`.

Supported-current option inclusion is not a defect. Arbitrary unknown local IDs have a different normalization domain in the original. The unknown-ID case below is only an OpenConductor no-regression control.

## Mounted boundary and five cases

The fixture mounts the real `ChatModelPicker` and `ModelPicker` under the real `KeybindingsProvider`. It keeps the actual `useLoadout`, storage decoder, formatter, current-choice ordering, selected-row logic, and search implementation. Only external catalog/settings/favorite reads, native IPC, decorative icons/tooltips, and animation presence are simulated. The renderer is `react-test-renderer`, not a browser or native app.

The fixture seeds an explicit choice in the existing per-chat storage key. It records setup reads separately from writes, provider requests, configuration changes, and agent changes. Teardown checks action and storage deltas even when a label assertion fails.

1. A known canonical Claude model omitted from the catalog must display `Opus 4.8` in the chip, accessible name, and current row.
2. The `opus` alias must display `Opus 4.8` without rewriting its saved model or medium effort.
3. An omitted supported Codex model must retain `GPT-5.2 Codex` and its explicit local identity.
4. An unknown local extension must retain its literal ID, adaptive effort, and local agent. This is not original parity.
5. A nonfavorite current Claude model must remain checked through catalog refresh, friendly-label search, exact-ID search, and search clearing. Its model, agent, effort, and fast setting must remain unchanged.

Static source predicts three label failures and two passing controls. These are predictions, not observed RED or GREEN results.

## Verification and delivery gate

- Original packet hash and size passed.
- All ten current-source snapshot comparisons passed at the named main commit.
- `git diff --check` passed for the staged baseline.
- The focused command is `node --test src/features/chat/chatModelFriendlyLabel.test.ts`.
- Existing hosted CI discovers the file with `node --test "src/**/*.test.ts"`. No workflow, loader, or existing assertion is changed.
- Local JavaScript, Rust, native, provider, typecheck, and browser execution are not run. Native execution remains with the sole admitted executor.
- Actual hosted behavioral RED is required before any formatter repair. The same fixture must then pass unchanged before merge, along with all exact-head workflows.
- No screenshot is available because this increment changes no UI and runs no browser or native app.

The separate attachment-settlement checkpoint remains preserved in local commits and a private selected-file backup. It is not bundled into this baseline or stacked beneath it. The separate #1083 consuming-main package watch also remains active.
