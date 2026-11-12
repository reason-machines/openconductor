# Unicode 11 widths in ordinary terminals

Conductor Rebuild first published ten frozen cases with production unchanged. Hosted CI then reproduced all six intended width failures and passed all four controls. The candidate activates the already-installed Unicode 11 provider in the ordinary terminal initializer before any live or restored output.

## Source contract

Default main `26f8345401efb021bef2f12b17815eba6c57170c` was fetched and read on Reason Cloud. Its `src/features/terminal/session.ts` creates xterm with the default Unicode provider. The existing Run and Setup component already activates Unicode 11. This ordinary-terminal finding is independently bound to Conductor's normal terminal caller, not inferred from the script component.

The retained real-application chain is `eSa → w9e → dno → uno → cno → lno`. The shared `lno` factory enables proposed APIs, loads `Wyr`, and sets `unicode.activeVersion = "11"` before opening or writing to the terminal. The renderer imports `g8 as Wyr`, while the index exports `Vbt as g8`. `Vbt` registers the provider `Kbt`, whose version is `11`.

[The source manifest](source.json) binds two complete assets and 23 exact UTF-8 spans to REA acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. It reuses the preserved spans from the script Unicode and terminal cursor evidence. The existing [Unicode source analysis](../../scripts/output-unicode/README.md) separately compares the retained provider's four width tables with the pinned `@xterm/addon-unicode11` 0.9.0 package. No new package or lockfile change is needed.

These are compiled-source observations. The retained renderer analysis exhausted its worker heap, so exact byte spans and alias joins do not constitute a complete semantic call graph. No reference JavaScript is evaluated, and no new REA runtime observation is claimed.

## Behavioral regression

[The fixture](../../../src/features/terminal/sessionUnicode.test.ts) loads the production session module. Its terminal delegates parsing, buffering, Unicode providers, writes, and disposal to the installed real xterm engine. The PTY, DOM opening, focus, fitting, preferences, and storage are isolated boundaries. Output enters through the production PTY event callback and decoder; restored output enters through the production saved-tab and history path.

The ten frozen cases cover panel emoji width, center-terminal adjacent emoji, a wrap boundary, a newer combining mark, ASCII, CJK, an existing combining accent, split UTF-8 event data, first-write history restoration, and sibling cleanup. Six width counterexamples and four passing controls are expected on the unchanged baseline. Setup failure is not a qualifying regression. Cursor coordinates, buffer row contents, and cell widths are public xterm observations, not addon-call spies.

[The frozen fixture](frozen-sessionUnicode.test.ts.txt) and [unchanged baseline session](baseline-session.ts.txt) retain the inputs for before-and-after comparison. The manifest records their identities and every existing compatibility fixture's assertion-body hash. Later dependency-boundary adaptations must not change those assertions.

## Hosted baseline and candidate

At test-only head `35fcc0bef38d97b4c87931bf2650084cceec580b`, [unit job 130966107936](https://github.com/reason-machines/openconductor/actions/runs/43152920803/job/130966107936) reproduced six intended assertion failures at cases 2096 through 2099, 2103, and 2104. Cases 2100 through 2102 and 2105 passed. The whole suite reported 3298 passes and six failures across 3304 tests. The build job also stopped at this test gate. This is a qualified behavioral failure, not a dependency or fixture setup failure. [The hosted receipt](hosted-red.json) and [log excerpt](hosted-red.log) retain the evidence.

The candidate changes only the import, `allowProposedApi`, addon loading, and active Unicode version in `session.ts`. Fresh main `621ed16e9a24615a6bbecaf976be9589b70c0e5d` was fetched, merged through the ordinary integration path, and its ordinary initializer was confirmed byte-identical to the frozen baseline before editing. Five existing fixture boundaries gain a Unicode addon stub and a `unicode` property. Their assertion bodies and the entire new ten-case fixture remain unchanged. These stub fixtures do not establish glyph parity.

At candidate `2bc7e048`, [unit job 130980199839](https://github.com/reason-machines/openconductor/actions/runs/43157302395/job/130980199839) passed all ten frozen Unicode cases. The full suite passed 3336 of 3341 tests. All five failures came from `evidence/resource-terminal-labels/regression.cjs`: its strict loader rejected the new `@xterm/addon-unicode11` import before reaching the resource-label assertions. The build stopped at the same test gate, before typecheck.

The compatibility correction adds the missing addon stub and the terminal stub's `unicode` property. All five resource-label test bodies remain byte-identical to candidate `2bc7e048`, and their digest is now part of the static verifier. Fix Root Causes keeps this correction at the fixture dependency boundary rather than altering production or weakening assertions. Hosted full-suite and typecheck confirmation remain pending. No workflow or dispatch was changed.

## Checks and limits

Passed on Reason Cloud without running JavaScript:

```bash
python3 evidence/terminal/session-unicode11/verify_source.py \
  --original-dir .oc-tmp/scripts-audit-1222/originals
git diff --check
```

Both complete assets, 23 spans, ten caller and provider joins, ten frozen cases, the baseline snapshot, and the preserved existing assertion bodies passed static checks. These static checks are separate from the qualified hosted baseline failure.

The ten candidate behavioral cases passed in hosted CI. Full-suite compatibility confirmation, frontend typecheck and build, macOS packaging, and consuming-main checks remain pending. The baseline build did not reach typecheck after its failing test gate. No local Node, browser, native app, provider, or shell PTY runtime was started. No screenshot is supplied because this lane has no browser or native execution admission. Glyph rendering, fonts, native output delivery, installed-app identity, and side-by-side visual parity remain unverified even after isolated parser checks pass.

Fix Root Causes places the correction before the first output write instead of altering emitted text or cursor positions. The Laziness Protocol keeps the production change to activating the already-installed provider in the existing initializer. Test Behavior, Not Implementation keeps the assertions on output columns and cell widths rather than addon construction. ScriptOutput, Setup, OSC8, input policy, focus, lifecycle, and backend behavior are outside the product diff.
