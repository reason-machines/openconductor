# Ordinary-terminal line feeds

Conductor Rebuild requalified this candidate against main `fc5215e8b6e7fd5e12767155fdbb9d0bcc1e82f1`, after #1127 merged at `c3b79b39bfafbdde2e7b2c4546b14385bf379b5f`. The assigned branch merged fetched main normally. Its tracked tree matched that main before these tests were added. The ordinary initializer still omits `convertEol` and retains the Unicode 11 correction.

## Retained Conductor source

The acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` binds the ordinary terminal through `eSa`, `w9e`, `dno`, `uno`, and `cno` to factory `lno`. That factory constructs `eno` with `convertEol:!0`. The renderer's terminal and browser-core constructors forward these options. Its own parser resets the column on LF when conversion is enabled. The options-update function does not replace this option.

[source.json](source.json) binds two complete retained assets, eleven exact byte spans, eleven positive joins, the fresh-main product hash, and nine protected files. Existing reference spans are linked rather than copied. The five new renderer spans are under [reference](reference).

The previous REA renderer analysis exhausted its worker heap. Exact spans and alias joins establish compiled-source evidence, not a complete semantic graph or observed reference behavior. No reference JavaScript was evaluated.

## Frozen behavioral tests

The new `src/features/terminal/sessionLineFeed.test.ts` retains the proven loader prefix from `sessionUnicode.test.ts` without changing that existing test. It drives the production PTY event callback and the installed real xterm parser. Assertions read public buffer rows and cursor columns. PTY transport, DOM opening, fit, preferences, and storage are isolated boundaries.

Six counterexamples cover panel LF, center-terminal wide output followed by LF, separate output events, consecutive LF, the right margin, and SGR around LF. Four controls cover CRLF, carriage return, plain output, and sibling disposal. The expected six failures and four passes remain a hypothesis until the automatic hosted job reaches the assertions.

Test Behavior, Not Implementation keeps checks on rows and columns instead of constructor-option spies. The Laziness Protocol limits the proposed product correction to the existing initializer's boolean `convertEol` option. No production file changes in this first publication.

## Verification

These static checks passed on Reason Cloud:

```bash
python3 evidence/terminal/session-linefeed/verify_source.py \
  --original-dir .oc-tmp/scripts-audit-1222/originals --stage baseline
sha256sum -c evidence/terminal/session-linefeed/fixture.sha256
git diff --check
```

The source verifier checks complete asset hashes, byte spans, joins, all ten frozen cases, the unchanged loader prefix, the product baseline, and protected files. It runs no JavaScript. For a later candidate, `--stage candidate` permits only `convertEol: true` immediately after `allowProposedApi: true` and verifies the rest of the product bytes against the same baseline hash.

Automatic hosted CI runs the behavioral baseline after publication. Only genuine assertion failures permit the product correction. Keep all ten test cases frozen after that result. Merge requires every workflow on the exact corrected head to pass. No test gate is disabled, weakened, retried, or manually dispatched.

## Boundaries and remaining proof

The sole initializer lease covers `convertEol` only. Unicode settings, all ten Unicode tests, ScriptOutput, Setup, OSC8, AppPrefs, focus, control bytes, PTY lifecycle, providers, and backend behavior remain outside the correction.

Hosted behavioral tests, typecheck, build, package, and native acceptance have not run for this candidate at the first publication. No local JavaScript, browser, native, or provider runtime was started. Parser rows do not prove installed-app output, PTY delivery, fonts, glyphs, or side-by-side appearance. Native acceptance remains with its existing owner, not a merge gate introduced by this lane.
