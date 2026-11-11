# Local agent config sync

## Retained reference, not native acceptance

The held Conductor renderer/index request chain is recorded in [the source manifest](source/manifest.json). The original uploaded archive SHA-256 is `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`. Its two asset hashes and 52 exact byte spans were rechecked against the original archive on 2026-11-11. No extracted JavaScript was evaluated.

The General control opens `sync-agent-configs-dialog`. The dialog reads independent local MCP, slash-command and skill diffs; offers names absent from the other agent; defaults missing items selected; and submits only selected entries. Existing names are not overwrite candidates. A successful copy closes only when there are no failed or unsupported entries. Reopening resets selection and reads a fresh diff.

This is local file copying, not Conductor cloud/team/org functionality or CLI authentication transfer. Source MCP definitions may contain literal environment/header values. OpenConductor keeps these values in its backend and sends only displayed names, category errors and copy counts to the renderer. No authentication/session/Keychain file or provider launch is part of this feature.

## Reproduction

Fresh default main `385ccb5229f56ff33903f034352eaa9827c40f0e` passed a disabled prop and no-op callback to the real General Sync button. The original regression is `src/settings/configSync.test.ts`; the component harness mounts the actual GeneralPage and controls while blocking unrelated native/provider calls.

The baseline test was committed first at `7594de07d4205c6f88133770157ad04b3708ad1c`. Its frozen test SHA-256 is `1c96ca31dfbb30e2f110caa22ce4046a52d33d5190d3c6107409904c73730e92`. At 07:51:17–07:51:18Z the admitted foreground run failed at the intended assertion:

```text
not ok 1 - General Sync opens a local selection dialog without copying files
error: 'local config sync must be reachable'
operator: 'notStrictEqual'
# tests 1
# pass 0
# fail 1
```

The baseline TAP SHA-256 is `a2456a0ff7e5c109c475205a5240ac77e3272e6ce242da1a169bb50f07d73ad6`. A prior Python archive-extraction compatibility error stopped before Node and is not counted as this behavior failure.

## Verification surfaces

The unchanged original regression and eight additional frontend checks passed at 08:06:07–08:06:09Z: **9 passed, 0 failed/skipped/cancelled**, exit 0. The frozen UI source is commit `ad494af1337c124bc7efd2f9937ba37e0c7d57bc`; its archive SHA-256 is `1b787fd022abbac2d3ef9312fe9f9824d82fcf9b0f5998827f34bec3e7b6f77a`. Fresh default main `b34ba2de9ad45365715d21a0bfe24d9c36b335fb` had identical relevant General/controls/Modal baseline bytes. The actual working head was `374b3743eba19d51218bae0c386fd7f23b939967`, with the same UI input bytes. The foreground command used the already-held React 18.3.1, renderer 18.3.1 and TypeScript 5.9.3 dependency prefix, a 60-second timeout and 768 MiB Node heap:

```bash
CONFIG_SYNC_SOURCE_ROOT="$frozen" CONFIG_SYNC_DEPS="$existing_deps" \
  NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 60s \
  node --test --test-concurrency=1 \
  "$frozen/src/settings/configSync.test.ts" \
  "$frozen/src/settings/configSyncDialog.test.ts" \
  "$frozen/src/settings/configSyncModel.test.ts"
```

The passing TAP SHA-256 is `5a497a872c9df36c24c42b90706e1462a54fcaf87d729569c19f075014821684`. No app build, native invocation, real config access or backend file-copy test ran in this unit.

Mounted frontend checks exercise the production control/dialog/model against a synthetic IPC adapter. They cover read-only opening, exact per-item/direction selection, no-selection disabling, pending close/submit guards, partial failure refresh, mutation errors, and cancel/reopen reset. They do **not** prove real file copying.

Backend fixtures exercise the production Rust module with an explicitly passed disposable synthetic home. They must never inspect the process HOME, real CLI configs, credentials or provider state. MCP env/header values in tests are inert synthetic strings. File tests are distinct from native Tauri command, sandbox/permission, macOS WebView and visual acceptance.

No native or screenshot verification is claimed by this source packet. Native permissions, actual-app copy/reopen execution, visual comparison and real-provider behavior need separate admission. The held plugin wrappers alone do not prove those outcomes.

## Integrated delivery status

On 2026-11-11, default main `966e331c7eea6963327fd81a62d5a872fd72fabe` was merged into this feature branch. Its GeneralPage, controls and Dialogs bytes still match the original disabled-control baseline. All frontend files remain byte-identical to the passing `ad494af13` fixture. Both Tauri commands are registered with the local adapter; this is a source check, not an IPC execution result.

The corrected backend candidate is `76db1e1e2ba22f03fc87ab11df4a009e75d978ca`. The replacement RED archive SHA-256 is `18d57540ccffca9a01d8eeec0fe3c11805e84ad00c3de63de46e1ef53b88fcc0`; the GREEN archive is `9eb1447eb668a878e5996ab29d41dde655455be64aa6736216005c4fc5b18653`. All candidate file hashes still match the frozen manifest after integration. The earlier 24-case packet was withdrawn without execution. The separately queued offline harness and corrected pre-fix MCP regression have no local execution result recorded here.

### Hosted acceptance at PR head `62bca964b457324abff7683c65bcc0c747115204`

On 2026-11-11, [Ubuntu Tauri check, test and clippy](https://github.com/reason-machines/openconductor/actions/runs/42987959170/job/130413578683) passed. Its log lines 3379–3403 report **all 25 production `config_sync::tests` passed**, including `quoted_mcp_map_keys_round_trip_without_becoming_paths`. These exercise the real backend module with disposable synthetic homes and inert MCP environment/header values, not real user configs. [The machine-readable acceptance record](hosted-acceptance-62bca96.json) binds all five module files byte-for-byte to locked `76db1e1e2`, PR head `62bca964b`, and the actual tested merge `54b0d4787f2820beaf68aea45c5b334f34fa3698`.

[Frontend typecheck and build](https://github.com/reason-machines/openconductor/actions/runs/42987959170/job/130413578322) and [macOS Tauri check, test and clippy](https://github.com/reason-machines/openconductor/actions/runs/42987959170/job/130413578657) also passed. This establishes compilation and backend file-copy behavior at that head, not config-sync IPC or native acceptance. The local `eea14847b` source tree matches the hosted head exactly: `07090f39b46c7b78f226bac5882eb90bf868a55c`.

The PR's [nested Codex chat E2E](https://github.com/reason-machines/openconductor/actions/runs/42987959159/job/130413578549) failed: immediately after changing the access selector to Ask first, both the selected and persisted policy remained `full`. The standalone Codex job and the Settings app-flow check passed. The failure blocks merging; its cause is not established by those passes. Current default main `11a5f73df99faa0d33bcc0c19b78606bc2c0b992` has unchanged Codex selector, policy-store, driver and diagnostics source relative to the checked feature base.

Config-sync Tauri IPC, native permissions, actual-app copy/reopen behavior and visual parity remain unverified. Hosted synthetic file-copy success must not be reported as those outcomes.
