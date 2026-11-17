# Active local Home row context menu

Conductor Rebuild / SAME271. Baseline main: `6ceaa15f6d4bb5efb0ad5aa23acff3a6d8ae5ca9`.

## Scope and retained reference

The retained Conductor 0.87.6 renderer explicitly binds the Home row through `_Jo → SI/EJo under wI → D9e → Aao`. The previously missing `EJo` declaration is **not inferred from the header**: its complete same-asset bytes pass `localWorkspaceId` directly to `D9e`.

[reference.json](reference.json) preserves 22 raw render-layer/helper spans, 14 exact import boundaries and their zero-based, half-open UTF-8 ranges, lengths and SHA-256 hashes. The supplied unchanged `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its original gzip is 3,480,193 bytes, SHA-256 `43ff62f3bd7d5cde0902f3a117f386e7a68e148348206855112ba1727440f37d`. Both identities and all ranges were verified on Reason Cloud. Original evidence lineage is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

The ledger recovered previously retained bytes on the authorized Mac. No fresh extraction, installed-app identity read, REA invocation or app launch occurred. Retained JavaScript stayed inert text: syntax parsing never imports, evaluates or executes it. Three previously verified wrappers are reused; no repeated wrapper audit was needed. The source-link gap is resolved; it is not a new REA bug.

The core spans are:
- `EJo`: `[9855680,9855911)`, 231 bytes, SHA-256 `1f9414aa3bc8f9c26a5fbd69b1a42ce095b8168387cfc12226f61a2d04e89d6f`.
- `D9e`: `[7356258,7357851)`, 1,593 bytes, SHA-256 `6749cd651553318fd3c5bc1df59af226790e3e193e641e0fd4e747e716f78776`.
- `Aao`: `[7345831,7354118)`, 8,287 bytes, SHA-256 `9af62d9c3b16d666695a2d79ae20419105797c59f34f41682113acbdd19ca163`.

The action order and identity are the same shared local workspace actions already used by sidebar/header: read/unread, pin, status, section, rename, copy link, archive. Command hints depend on the current workspace route, not Home's keyboard selection. Imported mutation/data/permission/status bodies remain in `index-BGEQ8YjU.js`; this packet does not claim their persistence or permission implementation.

## Repair

Current-main `AllWorkspaces.Row` had primary-click activation but no context-menu handler. The frozen mounted regression reproduced **four passing controls and three intended failures**, all at the absent active-row handler, without setup/import errors.

- `AllWorkspaces` exposes a narrow row/position context-request callback. The active row consumes only its context-menu event and forwards its own workspace, repository and coordinates. Primary click, keyboard selection, filtering and archive-button code remain unchanged.
- `HomeWorkspaceScreen` composes the existing Home list and unchanged `WorkspaceContextMenu`, with the existing Rename dialog. It resolves the target from current repository state, preserves row identity independently of keyboard selection, and dismisses a removed or lifecycle-ineligible target. Rename state survives menu dismissal.
- `App` replaces only its Home import/call and supplies existing sections, new-section, copy-link and error capabilities.
- The App hydration fixture now loads the real new screen instead of treating its unknown import as an inert component. Its four assertions remain unchanged.

This is deliberately **active local rows only**. Archived and unstarted context menus remain outside this repair; their lack of a menu is not claimed to match Conductor. The existing archived Unarchive button is preserved. No shared menu lifecycle branches were changed and no cloud-only Start/UI was introduced. In retained source `Aao/Mao/Bzt`, Start's receiver explicitly accepts only a cloud backlog item, so it is not a local behavior requirement. Broader archived/unstarted menu parity needs its own scoped receiver/lifecycle work rather than blindly reusing the active Archive menu.

## Verification

The frozen [mounted regression](../../src/components/homeContextMenu.test.ts), SHA-256 `000a0ac3eefce9da250cb31dcc535bd6965c192fd0a764b5debb18a42edb3818`, stayed byte-identical from RED to GREEN:

```bash
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 \
  src/components/homeContextMenu.test.ts
# before product edits: 4 PASS / 3 intended FAIL, exit 1
# after: unchanged 7 PASS / 0 FAIL, exit 0
```

The controls cover primary click, Enter/keyboard selection, archived/unstarted active-menu exclusion and the existing pending/consumed Unarchive action. The intended failures exercise active-row identity/position, keyboard-target independence and filtered-result identity. These are mounted production list handlers with runtime dependencies stubbed, not browser/native event propagation.

```bash
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 \
  src/components/allWorkspaces*.test.ts src/components/home*.test.ts src/home/*.test.ts
# PASS 193 / FAIL 0 / SKIP 0
```

That total includes four additional integration tests mounting the production new screen, shared context-action composition and shared action renderer. They verify read/pin/status/archive dispatch targeting; section/copy/rename targeting; rename surviving menu dismissal; live target state; and removal/lifecycle invalidation. The list request and menu portal/focus primitives are stubbed in that integration fixture. It does not prove actual focus/portal layout, browser event bubbling, clipboard contents, dialog submission, database mutations or native positioning.

```bash
python3 evidence/home-context-menu/verify.py --renderer <existing-retained-renderer-or-gzip>
# PASS: 22 spans + 14 import specifiers + source literal; exact parent ranges/hashes;
# unchanged fixture and recorded RED/GREEN/193-pass receipts
```

Without `--renderer`, the verifier checks self-contained span hashes/ranges and fixture/receipt integrity, explicitly reporting `parent_bytes_verified: false`. It never executes vendor code or reruns behavior.

The earlier local `npm run typecheck` failure is preserved in [typecheck.txt](typecheck.txt): this checkout was missing the already-declared/locked `@tauri-apps/plugin-fs`. The initial run also found a new test fixture missing `createdAt`; that fixture was corrected before the saved final diagnostic. During publication recovery, the documented `npm ci` path (`docs/packaging.md` and CI) restored dependencies with `--ignore-scripts --no-audit --no-fund` (395 packages). **No manifest, lockfile, product source, shim or frozen-test change was needed.**

After restoration, **`npm run typecheck` passed** and **`npm run build` passed** (branding, TypeScript and Vite; 54.02 seconds for Vite). Vite emitted only its advisory about chunks larger than 500 kB. The byte-identical frozen regression passed **7/7** again. See [the restoration receipt](local-validation.json), [restored typecheck](typecheck-restored.txt), [dependency install](npm-ci.txt) and the compressed [build log](build-restored.txt.gz). SHA-256 checks confirm `package.json`, both lockfiles and the frozen fixture stayed unchanged. These are local checks on Reason Cloud, not package/native acceptance. Hosted exact-head checks remain separate and must all pass before merge.

The initial adjacent run exposed four hydration-fixture failures because its real-module allowlist did not include the new Home screen. Adding that exact production module restored all four unchanged assertions; no expectation, timeout or behavior was weakened.

## Hosted CI adapter recovery

Hosted head `85f7c1cdd5002c8a57b1d0382a20b5e2f256a594` passed typecheck but failed 20 frontend unit cases: the strict App loaders in `src/palette/createSection.test.ts` and `src/palette/moveToSection.test.ts` still expected the old inert `AllWorkspaces` screen import. The two-line repair updates only those import maps to `HomeWorkspaceScreen`; every case body/assertion and the frozen Home fixture remain byte-identical. No production behavior, workflow, timeout or test gate was changed.

- Same 26 affected cases: **6 pass / 20 fail before → 26/26 pass after**.
- Full CI-equivalent local frontend run: **4,731 pass / 1 fail / zero skips**. This pre-commit run is **partial**, not an all-pass result: the disclosure remount test intentionally verifies every `src` file against `HEAD` and rejected the two then-uncommitted test edits.
- After committing the adapter repair, the unchanged disclosure guard/replay plus both Home context-menu suites **passed 13/13**, zero skips. No disclosure/tool source was edited.
- `npm run typecheck` and `npm run build` both **passed** again (42.74s Vite; advisory chunk-size warning only). CI-equivalent isolated `jsdom@26.1.0` dependencies were restored under ignored `.ara-state`; no tracked manifest/lockfile changed.

See [the exact recovery receipt](ci-recovery.json) and its losslessly compressed RED, GREEN, full-run and committed-guard logs. A complete post-commit frontend rerun was not repeated locally; all exact-head hosted automatic checks must still pass before merge.

## Acceptance gaps and ownership

Product browser, native, packaged-app and side-by-side acceptance are **NOT RUN**. There is no product screenshot: this lane has no runtime/native admission, and the sole executor's existing reservation was not duplicated. A Page preview is documentation rendering, not product evidence.

The existing package check and native owner remain responsible for consuming-build identity and visible acceptance. After inclusion, verify: right-click an active row while another is keyboard-selected; confirm no navigation; pin/read/status/copy/rename/section/archive target only that workspace; dismiss and reopen another row; filter the list and retry; preserve primary click, Enter, navigation, loading and the archived Unarchive button. Menu focus, geometry, clipboard and native events remain unverified until exercised on that build. No new timer, workflow dispatch, app/package installation, provider execution, reviewer or native/REA dispatch was created for this repair. Only local npm dependencies were restored through the documented lockfile path.
