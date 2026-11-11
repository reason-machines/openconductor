# Selected onboarding slide progress

Conductor Rebuild owns this focused correction. The regression runs the actual `FirstRunOnboarding.tsx` through real React 18.3.1 and `react-test-renderer`. Its assertions were frozen before the product change and remain unchanged.

## Retained reference

The sealed source packet `onboarding-selected-slide-source-sealed-6013.tar.gz` has SHA256 `881cfc191968de736d533ac98609c537a05331248af6c81b0a7df367f4db7e31`. It retains the original 15,206,400-byte REA archive, SHA256 `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`.

The complete recovered `Aoa` declaration is retained in [reference.json](reference.json). It comes from shipped renderer `renderApp-D_fmY7hW.js`, bytes `[10148881, 10151835)`, SHA256 `7b3c5e12a803ddc9ced7fc2d057e7811ea9103252a1ef947983a3d98679bb5b5`. REA lineage is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The full renderer is 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The selected slide's click handler is `onClick:()=>o(H.id)`. It only sets the selected ID. The keyed video resets progress on `onLoadedData`; the next-slide handler changes the ID and resets progress. This is recovered shipped JavaScript, not a recording of target execution.

The packet's stdlib byte verifier passed against fetched main `6ea86f222815a43ab12355eee2afbdcd981b2164` and again after fast-forwarding to current main `df44ec50db0e7632a7782089e4cde9e41e1ed6b8`. The complete OpenConductor counterpart equals the packet's original blob `4c8f28422197576afc94888f3afb62de1d861423`, SHA256 `35095c3e21ecdc94cd35939e71fc0b20717d747c4991c6a625367344ca3ee251`.

## Frozen behavioral check

[The focused regression](../../tests/onboarding-selected-slide.test.mjs) has SHA256 `d97a25df52563f4925e0ec31fb15c5094d5100d27d897094788a1e48e1370647` before the product correction. It loads and transpiles the actual component and `firstRun.ts` without source substitution. React state and effects are real. The clock and interval scheduler are deterministic boundaries. Keybinding registration is captured. The decorative mark and sign-in child are isolated; these tests make no sign-in or native-provider claim.

Five cases cover:

- Reselecting each of the three slides at 25% must leave both accessible progress and fill width unchanged, survive a rerender, and reach 50% on the original clock.
- Selecting a different slide must reset progress, start a full duration, and advance when that duration elapses.
- Next-slide keybindings and elapsed completion must wrap to the first slide while preserving the selected agent and the busy continuation guard.

Run from the repository root with the existing npm dependencies:

```bash
REACT_EFFECTS_DEPS="$PWD/node_modules" NODE_ENV=development \
  node --test --test-reporter=tap tests/onboarding-selected-slide.test.mjs
```

CI appends only this filename to the existing onboarding test command. It adds no job, dependency, installation, timeout, or changes to the existing onboarding fixtures.

## Test-first checkpoint

The test-only head `c72ba6d85bcacd5270409b799bcd8c29f96a311c` left the product source unchanged. [Hosted RED](https://github.com/reason-machines/openconductor/actions/runs/43054097403/job/130638800510) reproduced the immediate rewind on all three slides on 2026-11-11 at 16:03:06Z. The frozen component tests reported three failures and two passing controls. The combined onboarding command reported 47 passes and three failures.

Each failure occurred at the selected-slide click assertion, not fixture setup:

```text
clicking the selected slide must not rewind its visible progress
+ actual - expected
  {
+   value: 0,
+   width: '0%'
-   value: 25,
-   width: '25%'
  }
```

The changed-slide reset/duration case and next-slide wrap/agent/busy case passed. All other 21 reported checks passed at that test-only head.

The callback unconditionally reset progress even when the selected ID stayed the same. React therefore did not restart the ID-dependent timer effect. The correction removes that redundant reset from `select`. The existing `[current]` effect remains the single owner of progress reset and timer origin when the selected ID changes. No agent, sign-in, media, or persistence behavior changes.

Before the correction, fetched main `796f4568f243149529d9f55161850769dfa32dc2` still contained the exact unchanged counterpart. The product diff removes one statement. The regression SHA256 remains `d97a25df52563f4925e0ec31fb15c5094d5100d27d897094788a1e48e1370647`. Hosted GREEN for the corrected source is pending.

## Verification limits

Static `git diff --check` passed before publication. The retained byte verifier passed. No local React, Node test, browser, server, install, native, provider, or package execution was admitted or performed. No screenshot is available because browser and native execution were not admitted. Hosted React results do not establish video playback, raster parity, native behavior, or installed-app delivery.

The retained REA semantic-renderer analysis encountered heap exhaustion. The complete source span and byte checks are available despite that limitation; no new REA acquisition or target-code evaluation was performed here.

Strict physical publication remains UNSATISFIED and unwaived. Ordinary source PR publication and hosted automatic checks are separate from that requirement.
