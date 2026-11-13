# Ordinary-terminal line feeds

Conductor Rebuild requalified this candidate against main `fc5215e8b6e7fd5e12767155fdbb9d0bcc1e82f1`, after #1127 merged at `c3b79b39bfafbdde2e7b2c4546b14385bf379b5f`. The assigned branch merged fetched main normally. Its tracked tree matched that main before these tests were added. The ordinary initializer still omits `convertEol` and retains the Unicode 11 correction.

## Retained Conductor source

The acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` binds the ordinary terminal through `eSa`, `w9e`, `dno`, `uno`, and `cno` to factory `lno`. That factory constructs `eno` with `convertEol:!0`. The renderer's terminal and browser-core constructors forward these options. Its own parser resets the column on LF when conversion is enabled. The options-update function does not replace this option.

[source.json](source.json) binds two complete retained assets, eleven exact byte spans, eleven positive joins, the fresh-main product hash, and nine protected files. Existing reference spans are linked rather than copied. The five new renderer spans are under [reference](reference).

The previous REA renderer analysis exhausted its worker heap. Exact spans and alias joins establish compiled-source evidence, not a complete semantic graph or observed reference behavior. No reference JavaScript was evaluated.

## Frozen behavioral tests

The new `src/features/terminal/sessionLineFeed.test.ts` retains the proven loader prefix from `sessionUnicode.test.ts` without changing that existing test. It drives the production PTY event callback and the installed real xterm parser. Assertions read public buffer rows and cursor columns. PTY transport, DOM opening, fit, preferences, and storage are isolated boundaries.

Six counterexamples cover panel LF, center-terminal wide output followed by LF, separate output events, consecutive LF, the right margin, and SGR around LF. Four controls cover CRLF, carriage return, plain output, and sibling disposal. All six counterexamples failed at actual output-row equality assertions on the published baseline. All four controls passed.

Test Behavior, Not Implementation keeps checks on rows and columns instead of constructor-option spies. The Laziness Protocol limits the product correction to the existing initializer's boolean `convertEol` option. The first publication changed no product files. After qualifying hosted failure, the correction adds only `convertEol: true` immediately after `allowProposedApi: true`.

## Verification

These static checks passed on Reason Cloud:

```bash
python3 evidence/terminal/session-linefeed/verify_source.py \
  --original-dir .oc-tmp/scripts-audit-1222/originals --stage baseline
sha256sum -c evidence/terminal/session-linefeed/fixture.sha256
git diff --check
```

The source verifier checks complete asset hashes, byte spans, joins, all ten frozen cases, the unchanged loader prefix, the product baseline, and protected files. It runs no JavaScript. For a later candidate, `--stage candidate` permits only `convertEol: true` immediately after `allowProposedApi: true` and verifies the rest of the product bytes against the same baseline hash.

Automatic hosted baseline `d0cf738771f7e4d81965ed963265dd1e4cb4bd03` ran in [CI 43167464077](https://github.com/reason-machines/openconductor/actions/runs/43167464077). [Unit job 131012576223](https://github.com/reason-machines/openconductor/actions/runs/43167464077/job/131012576223), from log line 13445, reported six intended assertion failures in cases 2183 through 2188 and four passing controls in cases 2189 through 2192. For example, panel output was `'    right'` instead of `'right'`. All ten Unicode controls also passed. [The hosted receipt](hosted-red.json) records each actual and expected row.

[Build job 131012576237](https://github.com/reason-machines/openconductor/actions/runs/43167464077/job/131012576237) passed typecheck, then stopped at the same six-failure test gate. Its suite passed 3395 of 3401 tests. Build was not reached. The ten line-feed cases remain byte-identical to the first publication. Static candidate preservation checks passed before the correction was published. Automatic candidate verification is pending.

Merge requires every workflow on the exact corrected head to pass. No test gate is disabled, weakened, retried, or manually dispatched.

## Boundaries and remaining proof

The sole initializer lease covers `convertEol` only. Unicode settings, all ten Unicode tests, ScriptOutput, Setup, OSC8, AppPrefs, focus, control bytes, PTY lifecycle, providers, and backend behavior remain outside the correction.

Hosted behavioral baseline and baseline typecheck ran as recorded above. Candidate tests, candidate typecheck, build, package, and native acceptance remain unverified at correction publication. No local JavaScript, browser, native, or provider runtime was started. Parser rows do not prove installed-app output, PTY delivery, fonts, glyphs, or side-by-side appearance. Native acceptance remains with its existing owner, not a merge gate introduced by this lane.
