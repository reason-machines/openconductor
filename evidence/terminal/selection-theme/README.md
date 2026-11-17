# Ordinary terminal selection semantic colors

Authored by Conductor Rebuild. Bounded source/unit repair; native acceptance **NOT_RUN**.

## Reference and scope

Revalidated at main `b22fa9adaf67fa79fc3dddf72914cae01f352b08`. The retained real-Conductor REA qualification is [the ordinary-theme-refresh source manifest](../ordinary-theme-refresh-1f/source/source.json), evidence ID `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its renderer asset is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

- [`IJe`](../ordinary-theme-refresh-1f/reference/IJe.txt), renderer bytes `[3139253,3140055)`, 802 bytes, SHA-256 `ea65e840d4491339eaeeed4beda371d58fc6a87b78fc14e50c6a32ac9915d081`, assigns `selectionBackground:F3("--primary")` and `selectionForeground:F3("--primary-foreground")`. It has no inactive-selection override.
- [`F3`](../ordinary-theme-refresh-1f/reference/F3.txt), renderer bytes `[3138840,3139137)`, 297 bytes, SHA-256 `106c7a6024877413de767c03c118b06ab6724d55003afa4fc9b09961d9a2a0d0`, reads the computed token value and passes hex/RGB values through. No alpha scaling occurs in either reference span.
- Retained `lno`, `dno`, `w9e` and `n9s` spans establish constructor, existing-instance attachment and root-appearance refresh callers. All six spans above were rehashed and their byte lengths matched their manifest. These are static shipped-app observations, not a new acquisition, REA invocation or native execution. Reference source is treated as data and is not executed by the regression.

OpenConductor's existing [ScriptOutput](../../../src/components/ScriptOutput.tsx) already maps the semantic pair to `--accent` and `--accent-text`. Ordinary terminal construction and appearance refresh instead appended `66`/`4d` alpha bytes to the background and omitted selection foreground. The repair uses the existing semantic pair in both assignments and removes the now-unused alpha helper. It omits the inactive override, matching `IJe` and ScriptOutput, rather than inventing another alpha value. No ANSI token values, palette, nonselection opacity, cursor/input rules or ScriptOutput production code change.

The ledger granted only session selection fields, the new regression, selection-only expectations in the two existing theme tests, shared fixture selection fields, and this evidence directory. Terminal shortcuts/LF, repository pickers, native QA and dialogs are separate owners/scopes.

## RED and unchanged GREEN

On Reason Cloud, Node `v22.23.5`, with existing dependencies and no install:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/terminal/selectionTheme.test.ts
```

- **RED reproduced:** 4 passed, 5 failed, 0 skipped, exit 1 on unchanged main product code. Constructor and refresh each failed separately for background and foreground. The lifecycle case also failed on the initial background. Two ScriptOutput controls, unrelated-attribute control and retained-reference integrity check passed.
- The regression and expectation fixture were committed before product edits as local `98d2ded7`.
- **GREEN passed:** identical command, 9 passed, 0 failed, 0 skipped, exit 0.
- Regression bytes stayed SHA-256 `694f95675789ed9e1aad4c06be8c500df4c7c86cb66f42c62f106fa5a4dfc938`; shared fixture stayed `6a9fcfffdec8c84ccb17ec4f378b8548bfd7e06f89f0124383445647d7988607` between RED and GREEN. Existing expectation changes are limited to selection fields; no nonselection assertion was removed or weakened.
- ScriptOutput stayed SHA-256 `1488c5c247527b2608310a201f478801a50f9d0f500edef2b71b55ce378c1a70` throughout. The two new ScriptOutput component controls verify initial mapping and independent foreground/background refresh.

The regression exercises production session code and real headless xterm public theme options, plus the actual ScriptOutput component through React test renderer. DOM mutations, computed CSS and PTY transport are synthetic. Tests change foreground/background tokens independently, keep the other selection field constant, retain ordinary background/foreground controls, check same-terminal/no-respawn behavior, ready/exit preservation and the omitted inactive override.

## Adjacent and compile checks

```bash
nice -n 19 timeout --kill-after=5s 180s node --max-old-space-size=768 --test --test-concurrency=1 src/features/terminal/*.test.ts src/scripts/outputCursor.test.ts src/scripts/outputUnicode.test.ts src/scripts/outputCopy.test.ts src/scripts/outputLinks.test.ts src/scripts/runOutputSelection.test.ts
nice -n 19 timeout --kill-after=5s 180s node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit
nice -n 19 timeout --kill-after=5s 120s npm run lint:colors
git diff --check
```

- **Passed:** 321 adjacent/regression cases, 0 failed, 0 skipped. Includes ANSI, ordinary appearance refresh, cursor/input/Unicode/line-feed/shortcut controls and ScriptOutput cursor, copy, links, Unicode and selection behavior.
- **Passed:** TypeScript typecheck with a 4096 MiB heap. The first attempt used a self-imposed 768 MiB heap and failed with a V8 heap-limit error (exit 134); no source/dependency change preceded the successful rerun.
- **Passed:** color lint, all 6 checker tests and no prohibited literals/hue violations across 1,191 scanned files.
- **Passed:** `git diff --check`.

[The check receipt](checks.json) records commands, outcomes, frozen input hashes and uncompressed/compressed log hashes. Raw logs are retained losslessly as [RED](red.tap.gz), [GREEN](green.tap.gz), [adjacent](adjacent.tap.gz), [color lint](color-lint.log.gz), and [initial bounded-heap failure](typecheck-768mb.log.gz).

## Acceptance limits

No browser paint, original-app launch, native app, real PTY, Mac dispatch, install, package or deployment was run. There is no screenshot because this lane explicitly excludes product/browser/native execution. Headless option assertions are not rendered contrast, focus/Find appearance, WebKit or side-by-side visual parity. Those remain **NOT_RUN** for the sole native executor when its prerequisites clear; this packet does not admit or dispatch that executor.

Ready standalone PR against main, not stacked. Merge only after every triggered workflow on the exact published head finishes successfully; conditional skipped jobs are reported as skipped, not tests passed. Package inclusion and native behavior remain separate from source merge.
