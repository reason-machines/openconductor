# Cursor theme lifecycle regression

Conductor Rebuild changes only the terminal cursor theme projection in `session.ts`, adds a nine-case regression with the original assertions preserved, and retains its source evidence. The four added product lines match the frozen candidate exactly.

## Reference contract

The retained Conductor chain is `V9` snapshot → `$kt.getSession` → `LAt/bI` → renderer `G5e` → `eSa` → `w9e` → `dno/uno/cno/lno` and renderer-local `$At` → `IJe`. For an existing available local session, `eSa` passes `showCursor = isInputEnabled && !isUnavailable`. `IJe` requests a transparent cursor when false, the foreground color when true, and the background color for cursor accent.

[The source manifest](source/reference.json) binds two complete original assets and 22 exact UTF-8 spans to retained REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. [The historical qualification](source/qualification-historical.md) explains the complete declaration and alias joins, pinned xterm source mechanism, and limits. Reference JavaScript was not evaluated. The earlier whole-module Babel extraction timeout remains an analysis gap; it was not repeated or relabeled as parser validation.

Default-main `3da2890517fb81365916ef1e4f7f80cc7a93d421` was fetched and read on Reason Cloud during qualification. A fresh delivery check at `1ebd7e0488773fba6a4b75e57c41236fc2d0874b` confirms all six source pins in the manifest remain byte-identical to the frozen baseline `b34ba2de9ad45365715d21a0bfe24d9c36b335fb`. Its constructor and ready/exit/failure paths project stdin admission but omit cursor theme state. The patch supplies that missing projection without changing stdin admission, status, user-input metadata, clearing, persistence, tabs, scripts, managed environment, or native code.

## Frozen identities

- Baseline `session.ts`: `e94da195a0f3d315ab2862f4f3333e4014df15f69b4ace90b53449258e60ad87`.
- Original frozen fixture, preserved as `source/frozen-cursorState.test.ts.txt`: `1cabc78d3cc6446eea19780fc5fd71a28578b1995ba7134be9194df1a72d3681`.
- Delivered fixture: `3a0d8e881ae09f03737a915fdc1f1ff20a5b1e6577c9daff012617940ca5a50d`. Only line 16's fake CSS variable values differ; all assertion lines are byte-identical.
- [Candidate patch](source/candidate.patch): `accd9f9e871a7489773836570b57abf1abcb963f0dab6626aa1d99091868aa65`.
- Applied candidate `session.ts`: `e7785e03355148c1937a02b3aca8cafebb1821fbb6cd304946b08c476fc11409`.

The [frozen manifest](source/frozen.json), [original execution request](source/execution-request.json), and reference manifest are preserved as authoring-time records. Their `false` execution/application fields describe that earlier freeze, not the current result.

## Verification

The existing sole serialized executor [reported the observed regression results](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46) on Reason Cloud. [The original execution receipt](source/original-terminal-receipt.json) retains both TAP streams, commands, timing, source identities, and process limits. Its SHA-256 is `5a300d93afe225d0a531376cbee7b965f0ede1e5e506010a27584720567fb864`, matching the original attachment byte for byte. It covers only the original fixture. [The corrected execution receipt](source/corrected-terminal-receipt.json), SHA-256 `33f8968214ed60839ba08e6f21c939cfdd048de62ab2a2fd2159800316399aae`, separately retains all three corrected-input phases. No second runner, dependency installation, browser, native app, shell PTY, or provider action was started in this delivery checkout.

- **Failed before the fix, as intended:** all nine tests failed with `ERR_ASSERTION` on missing cursor or cursorAccent options, not fixture setup. Baseline execution ran from 09:37:11.440281Z to 09:37:12.527978Z on 2026-11-11. There were no skipped, cancelled, or limit-exceeded tests.
- **Passed after the fix:** the same nine unchanged cases passed from 09:37:53.122246Z to 09:37:54.019861Z after applying only the frozen patch. There were no failures, skipped, cancelled, or limit-exceeded tests.
- **Passed in this checkout:** all six fresh-main source pins, 22 retained span hashes, frozen fixture/patch/candidate hashes, preservation of every assertion line in the delivered fixture, and `git diff --check`.
- **Passed on the delivered fixture:** the corrected-input baseline reproduced nine intended `ERR_ASSERTION` failures, followed by 9/9 passing cases on the exact candidate. Baseline ran from 09:53:55.456226Z to 09:53:56.348828Z on 2026-11-11; candidate ran from 09:54:19.784906Z to 09:54:20.638544Z. Targeted `node scripts/check-colors.mjs src/features/terminal/cursorState.test.ts` passed with no color literals or Neutral hue violations at 09:54:30.646192Z. No phase hit a limit, skipped a case, or was cancelled. Only line 16's fake CSS variable inputs changed from the preserved fixture; every assertion and the product candidate remain byte-identical. The unchanged checker and token source were used. [The correction record](source/fixture-input-correction.json) and its copy inside the receipt retain their earlier `false` execution field as authoring-time metadata; the receipt's actual phase results are authoritative for execution.
- **Passed on the original fixture:** all 124 tests across the 17 terminal and resource-label files passed with zero failures, skips, or cancellations. The existing focused executor used its qualified 393-package resolver, including `react-dom/server`, and retained the unchanged additional source dependencies. Node ran from 09:49:15.595052Z to 09:49:23.862240Z on 2026-11-11 and exited 0. The cancel-if-not-started disposition arrived after the unit completed; nothing was restarted or modified. [The final focused receipt](source/original-focused-terminal-receipt-final.json) and [original TAP](source/original-focused-124-pass.tap) match their attachments byte for byte. This result covers only original fixture `1cabc78d` and candidate `e7785e03`, not corrected fixture `3a0d8e88`; the corrected fixture's separate nine-case replay and targeted color lint are recorded above.
- **Not run locally:** full `npm run typecheck`. The executor lacks the full app resolver and type dependencies; its TypeScript/React cache does not qualify whole-app typechecking. Hosted frontend CI must supply that check.

The requested commands and bounds are retained in `source/execution-request.json`. The RED/GREEN fixture executes the production session module with PTY, xterm, DOM, preferences, and storage boundaries isolated. It checks startup, ready, exit, failed spawn, retry, sibling isolation, metadata preservation with and without prior input, and closed-terminal event isolation. Runtime TypeScript and React identities were verified by the executor. The xterm import is type-only and the Terminal boundary is mocked; this is not actual xterm package execution.

## Acceptance limits

This change is supported by source-option and isolated regression evidence. A visible-cursor counterexample additionally assumes an initialized cursor that shell output has not independently hidden. No screenshot or recording is supplied because browser/native execution is outside this bounded admission. Actual cursor rendering, installed-app behavior, native PTY delivery or reuse, shell redraw, and side-by-side visual parity remain unverified.

The PR, exact-head hosted CI, protected merge, and consuming-main package remain owned by this Session. The completed #1010 and #1014 consumer checks do not verify this new cursor change. The resize scout was superseded without implementation.
