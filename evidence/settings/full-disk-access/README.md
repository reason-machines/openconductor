# Settings Full Disk Access query and presentation

Conductor Rebuild wires the General Settings row to the native command delivered in [#1058](https://github.com/reason-machines/openconductor/pull/1058). This is a source-backed renderer follow-on, not native permission or visual parity evidence.

## Reference and scope

The original Settings49 packet is `settings-full-disk-status-v1.tar.gz`, SHA-256 `ca4d61e4a56322c88fa6aa8e810f16d30838467ba462249245944e8429a65c6d`. The original seven-case `fixture.json` is retained byte-for-byte (SHA-256 `1480a537fd6b946ba99b5e3a0e30a9f7ccee94cd619d78095c4897390f6e68af`). It was prepared but never executed; no mounted FDA harness existed in that packet. The new `replay.cjs` is our regression harness, not recovered Conductor code.

The retained real Conductor 0.87.6 REA renderer is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Original excerpts and their exact UTF-8 half-open byte ranges are preserved in `reference/source.json`:

- URL and 5000 ms interval: `[10707086,10707179)`.
- `cga`, query and logged rejection fallback: `[10707179,10707414)`.
- `fga`, status query with always-on window-focus refetch: `[10707414,10707597)`.
- `hga` false-only polling and `pga` opener: `[10707597,10707680)`.
- Full Disk Access registry row: `[10712836,10713476)`.

The source displays `Granted` only for strict `true`, keeps the System Settings button, and shows a manual-recovery error toast if opening fails. A rejected query logs its error and returns `true`. This is intentionally fail-open presentation. Neither that label nor a successful native heuristic establishes that macOS granted permission. The source has no non-macOS parity evidence. The native command's explicit unsupported-platform rejection is our design; the renderer applies the same rejection fallback rather than inventing another status.

`reference/source.json` is the immutable historical v1 manifest, not a current verdict: its old missing-native and unowned descriptions were superseded by #1058 and SAME49's ownership. Its unrelated zoom excerpt is retained only to keep the original manifest independently verifiable. No retained target code or old preparation/audit script is executed. Historical REA semantic-analysis heap exhaustion and the native deep-provider availability gap remain unresolved; this follow-on acquires nothing new.

## Change and design

Product paths are limited to `src/settings/GeneralPage.tsx`, `src/backend.ts`, and a notification callback relay through `src/settings/SettingsView.tsx` for the FDA opener failure. Notification-permission behavior, native command code, capabilities, entitlements, persistence and all other Settings rows are unchanged.

The backend adds `checkFullDiskAccess(): Promise<boolean>` invoking `check_full_disk_access` without arguments. The row's status is `boolean | undefined`: undefined has no label; only true shows `Granted`. False schedules a single five-second timeout. Window focus rechecks even after true. Unmount clears the timer/listener; a revision counter prevents an older pending response from replacing a newer response.

Per **Model the Domain** and **Type System Discipline**, the existing boolean result plus an undefined initial state is sufficient; no preference or independent loading flag is introduced. A separate imported FDA module was rejected because the frozen shared GeneralPage harnesses have closed module allowlists. The inline hook keeps one owner without changing those fixtures. A browser-event capability check leaves non-window component environments inert; the FDA replay supplies events/timers and asserts actual polling and refetch, so this guard cannot make its five missing-behavior cases pass.

## Baseline and automatic regression

Main was first read at `57e3d6982095aa563bf31bac47efbd984214fe9a`, then refreshed and the branch rebased onto `f73d7c30489bd09fbdeb78a812bc10a6bcfad21a`, containing #1064. The FDA baseline page bytes are identical at both commits; the automatic replay names the latter as its baseline. Its exact `GeneralPage.tsx` bytes are retained under `baseline/` (SHA-256 `28c970954afb645658f5be693189e3a49f2e52efc8510c309f419a0a3dad21e8`). The source has no FDA query or `Granted` branch. This is a confirmed source gap, **not an actual UI RED observation** and not a missing-module/compile failure.

`src/settings/fullDiskAccess.test.ts` is discovered by existing automatic frontend CI. It runs the same new replay and unchanged original JSON against the captured baseline and candidate, requiring five named missing-query/presentation assertion failures and two passing controls before requiring all seven candidate cases to pass. Setup/import errors cannot count as baseline RED. An additional candidate-only opener rejection check tests the recovered error message without changing the frozen seven-case fixture. The wrapper prints complete TAP to CI logs and writes receipts under the runner's temporary directory. No workflow, dispatch or rerun is added.

The replay mounts real GeneralPage and shared controls/model. Native query/opener, settings persistence, timers, focus events and unrelated UI boundaries are controlled substitutes. It tests pending/true/false/error labels, false-to-true polling, true-to-false focus refetch, opener URL, no preference writes, and timer/listener cleanup. It does not run the production native probe or observe actual browser focus delivery.

## Verification and limits

Local permitted command:

```bash
python3 evidence/settings/full-disk-access/verify.py
git diff --check
```

Hosted automatic CI command (not run locally):

```bash
node --test src/settings/fullDiskAccess.test.ts
```

Local source/static checks passed; mounted baseline/candidate proof, typecheck/build and full test results await exact-head automatic CI. Original FDA JSON, notification seven-case JSON/harness, concurrent-settings frozen harness/cases and Sync harness stay unchanged. `provenance.json` pins their relevant bytes.

No local Node or React execution, dependency installation, native/GUI/provider execution, real HOME/TCC.db read, Conductor acquisition or screenshot was performed. Native queue/allocator ownership and execution boundaries remain frozen. Package success, when verified after merge, proves build/bundle consumption only—not runtime correctness, permission behavior, OS event delivery or side-by-side parity.
