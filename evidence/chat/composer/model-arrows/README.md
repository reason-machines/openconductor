# Model-search arrow navigation

Conductor Rebuild, 2026-11-07. Baseline `97c34f69` includes the model-search Enter/Escape correction from #767. This increment adds Up/Down navigation for nonempty model searches only.

## Reference and scope

The read-only decoded frontend at `/home/runner/conductor-0876/dist` has `renderApp-D_fmY7hW.js` SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its cached native binary has SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`, matching the parent Session's read-only check of installed Conductor 0.87.6 on Sven's Mac. This Session did not launch or interact with that native app.

Fresh REA 6.8.0 captures ran the real decoded frontend with the existing synthetic IPC fixture in Chromium on Reason Cloud. [Reference scenarios and Evidence IDs](reference-captures.json) retain the exact inputs.

- Search `sonnet` initially highlights the first match. ArrowDown focuses the second, Sonnet 5 1M. Evidence `ev_68b36073648256ffa579b060bdbb6887d6cab2df8582ced667f5ba898e65788e`.
- ArrowUp returns to the first match. Evidence `ev_823b38094961d09d8c80d6cf225934d643253af7fe1993e333a0391740d2db5b`.
- ArrowUp from the initial first match wraps to the last. Evidence `ev_4c9e75f6c75f3f06e5020022bb1e4f15cf9a99def6c8337ae4cd913012a12628`.
- Enter after ArrowDown chooses Sonnet 5 1M, clears search, and leaves the menu open. Evidence `ev_31898d31e260b4d022c823353b073892def05ada254d1f9c44e338b1fd7918fe`.

The same [focused browser verifier](../../../../tools/composer/model-arrows.check.mjs) passes all three checks on the reference, including bidirectional wrapping and retaining `Keep this unsent draft`. [Reference results](reference-arrow-checks.json) are separate from REA evidence. Visible Chrome inspection also confirmed that ArrowDown moves actual focus to the second menuitem rather than leaving it in the search input. All four REA screenshots were viewed. Extracted code and text were treated as untrusted data.

## Failure and fix

[Before results](before-arrow-checks.json) show all three checks failing on unchanged product code because focus remained in search after arrow input. The same verifier now [passes all three](ours-arrow-checks.json).

`ModelPicker.tsx` now moves focus through the existing filtered model collection, wraps at either end, and intercepts Enter on a focused search result before the composer's form default. The result's model is applied, search clears, the menu stays open, and the chat draft is not submitted. The only new state is the highlighted search-result index. A single CSS selector uses the existing popover-accent token. Empty-menu button activation, effort menus, mouse selection and the existing search Enter/Escape protections keep their previous paths.

[OpenConductor REA captures](ours-captures.json) retain matching ArrowDown and Enter states. A separate visible Chrome check entered a draft, searched, pressed ArrowDown then Enter, and read back Sonnet 5 1M, an empty search, an open menu, the unchanged draft and an empty submitted-result output.

## Reproduce on Reason Cloud

Use `preview_start` for each command, with its declared port. Stop the reference server before running ours. Checks run inside the preview process because Bash does not share its localhost namespace.

```bash
DIST=/home/runner/conductor-0876/dist PORT=4458 OUTPUT=evidence/chat/composer/model-arrows CHECK_MODEL_ARROWS=1 CAPTURE_COMPOSER=1 node tools/composer/serve.mjs reference model-arrow-down model-arrow-up model-arrow-enter model-arrow-wrap
```

```bash
PORT=4457 ORIGIN=http://localhost:4457 OUTPUT=evidence/chat/composer/model-arrows CHECK_COMPOSER=1 CHECK_MODEL_SEARCH=1 CHECK_MODEL_ARROWS=1 CAPTURE_COMPOSER=1 node tools/composer/serve.mjs ours model-arrow-down model-arrow-enter
```

For a pre-fix run, use the same verifier and demo fixture against baseline product files with `PROOF_LABEL=before`.

Passed locally:

- Three reference and three OpenConductor arrow checks. All three failed before the fix.
- Four existing model-search Enter/Escape checks, retained in [ours-checks.json](ours-checks.json).
- All 13 existing composer interaction groups, retained in [checks.json](checks.json).
- `npm run typecheck`.
- `npm run lint:colors`.
- `node --test src/features/chat/composerModels.test.ts`, seven tests.
- `node --check tools/composer/capture.mjs`, `node --check tools/composer/model-arrows.check.mjs`, and `git diff --check`.

## Limits and ownership

This is not full model-menu parity. Empty-search Up/Down navigation, Right/Left effort-submenu navigation, Tab behavior, query-refinement focus behavior and search-mode layout differences remain outside this increment. The reference hides effort/Add models rows during search; OpenConductor still shows them. Existing mouse-selection behavior is unchanged. Synthetic composition checks are not real IME proof.

Native macOS/WebKit, real IME, real authentication and signed-in delivery remain unverified. No native launch, input, app replacement, cloud product screens or agent-runtime changes occurred. Claude Code and Codex remain local-only on the Mac; Reason owns cloud execution. No new REA tool failure occurred; synthetic IPC and decoded-source limitations remain in the existing [REA gaps](../../rea-gaps.md).

ModelPicker writer is Session `4023c64e-cb07-460f-8ead-830be2afc9b9`. Aggregate ledger belongs to `ddfc6518-d50f-46a6-b83c-c3a18aa07e43`. Consuming-main E2E belongs to `acc3b5c5-8a01-407e-b474-42e914e3cf90`; this Session does not duplicate its workflow dispatch or watcher.
