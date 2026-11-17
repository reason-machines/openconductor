# Reason cloud file identity — scoped routing repair

Prepared by **Conductor Rebuild**. This is OpenConductor's Reason-specific local/cloud integration, not a Conductor parity claim.

## Result

On independent current-main base `860041bd42aca394da3b8bdbf9d7fa1ca7597836`, the original, byte-unchanged 31-case regression changed from the retained **19 pass / 12 intended failures** to **31 pass / 0 fail**. The six normalized cloud targets, live and restored, now produce the existing explanatory cloud notice without opening a local diff, viewer or tab.

Three production files only:

- `conductorTools.ts` retains an optional complete `ReasonPath` beside the rendered tool input. Default Read uses its primary reported location; split Write/Edit rows retain each diff's own location. Raw tool-name/input precedence remains unchanged; matching is exact-raw first, then an unambiguous reported relative alias. Unknown/unmatched/ambiguous identity is not fabricated.
- `Transcript.tsx` closes over that row's target and forwards it as the optional second file-open argument. FileBadge/ToolRows, text, labels, inline previews and clickability are unchanged.
- `WorkspaceView.tsx` forwards that same target without cwd-normalizing known cloud paths and handles explicit cloud provenance **before** any exact local diff match or viewer selection. The old untyped-path heuristic and local routes remain unchanged.

No backend, dependency, command, cloud transport/API, ID substitution or cloud-workspace/team UI was added. This fixes wrong-file routing; it does not implement arbitrary cloud-file viewing or complete the broader one-chat local/cloud product requirement.

## Actual checks

All commands ran on Reason Cloud, foreground and sequentially. No additional Rust compile was run: the original actual-Rust `wire.json` and six frozen files remain byte-identical.

```bash
node --experimental-strip-types --test src/reasonCloudFileIdentity.test.ts
# PASS: 31/31; retained original RED is 19P/12 intended F.

node --experimental-strip-types --test \
  evidence/chat/reason-cloud-file-identity/controls.test.ts \
  evidence/chat/reason-cloud-file-identity/primary.test.ts
# PASS: 18/18; separate original 17 controls were 7P/10 intended F on baseline.
# The additional primary-location control failed on the first repair candidate,
# then passed after default Read was tied to its own primary location.

node --experimental-strip-types --test \
  src/features/chat/reason.test.ts src/features/chat/reducer.test.ts \
  src/features/chat/persist.test.ts src/features/chat/conductorTools.test.ts \
  src/features/chat/view.test.ts
# PASS: 66/66.

python3 evidence/chat/reason-cloud-file-identity/verify-treatment.py
# Checks frozen bytes, exact RED list, GREEN receipts, 26 click witnesses,
# unchanged 8 executed Rust spans and owned production scope.

npm run build
# PASS: full TypeScript, official branding, Vite (50.34s).

npm run lint:colors
# PASS: color-rule unit checks and 1266 source files.

git diff --check
# PASS.
```

The **new** exact-diff-key controls were not previously exercised: explicit cloud absolute paths both outside and beneath the local cwd, plus a relative cloud path, equal existing diff keys and must not dispatch locally. Additional controls verify the actual ChatPanel callback's exact object/Session forwarding, local-after-cloud behavior, primary Read, per-split diff sessions, raw-input precedence and unchanged untyped exact-match precedence. The 31 original tests and their inputs/assertions were not changed to add these cases.

The original regression executes the retained actual-Rust payload through real Reason adapter/reducer/persistence/buildRows, mounted production Transcript declarations and complete ToolRows, actual FileBadge click, and exact AST-extracted production ChatPanel/file-open callbacks. Environment/state sinks are inert; the whole app is not mounted. Supplemental callback controls use the exact production AST, not a replacement router.

`baseline.tap.gz`, `baseline-observations.json`, `source.json`, `freeze.json` and the original `README.md` are historical frozen RED evidence. Failing TAP logs are losslessly gzip-encoded; `log-encoding.json` pins each decoded SHA-256 and verified roundtrip. Assertions, input and probe bytes are unchanged. `treatment.tap`, `treatment-observations.json`, `controls-final.tap` and `adjacent-treatment.tap` are separate current treatment evidence. `observations.json` is restored to its original baseline bytes after every treatment run. The frozen test writes that output when executed; preserve its baseline copy before replaying.

The first full build failed before Vite because a reused dependency cache lacked main's already-declared `@xterm/addon-web-links`. `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` installed the existing lock without changing manifests or dependencies. The subsequent default build passed in full. Its initial failure is preserved in `build-cache-missing.log.gz`, not counted as a passing check. Foreground pipeline completion was followed by an empty own Node/Rust process readback and explicit heavy-slot release.

## Collision and scope

The WorkspaceView changes are only the ReasonPath type import, ChatPanel `openFile` prop type, Transcript callback binding, and `openFileOrViewer` signature/explicit-cloud guard. The full file is otherwise byte-identical to checked main. No changes to `attachFiles`, `attachTerminalOutput`, `attachDroppedPaths`, turn changes, file tree/search/palette actions, or local viewer state. The exact callback patch is retained in `workspace-callbacks.patch`.

## Verification limits

- No provider/CLI launch, credentials, authenticated API or real local/cloud filesystem read.
- No Tauri/native/browser/package acceptance or package inclusion verification; therefore no UI screenshot/recording. The admitted mounted-React tests are not native parity evidence.
- No second Rust compile or full chat suite. The default local build (including full typecheck) and color checks passed under a subsequent serialized build admission; CI state is reported separately on the pull request. Prior full-chat timeouts remain incomplete.
- No cloud Session/path reader contract is invented or assumed. The existing notice is the defined frozen outcome, not a cloud-content delivery claim.
- Release/native replay stays with existing release custody; no duplicate runtime dispatch.
