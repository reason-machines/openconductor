# Unicode 11 widths in ordinary terminals

Conductor Rebuild adds ten test-first cases for ordinary terminal output. At this milestone, production code is unchanged. The ordinary hosted frontend jobs must demonstrate a real width assertion failure before the minimal provider activation is applied.

## Source contract

Default main `26f8345401efb021bef2f12b17815eba6c57170c` was fetched and read on Reason Cloud. Its `src/features/terminal/session.ts` creates xterm with the default Unicode provider. The existing Run and Setup component already activates Unicode 11. This ordinary-terminal finding is independently bound to Conductor's normal terminal caller, not inferred from the script component.

The retained real-application chain is `eSa → w9e → dno → uno → cno → lno`. The shared `lno` factory enables proposed APIs, loads `Wyr`, and sets `unicode.activeVersion = "11"` before opening or writing to the terminal. The renderer imports `g8 as Wyr`, while the index exports `Vbt as g8`. `Vbt` registers the provider `Kbt`, whose version is `11`.

[The source manifest](source.json) binds two complete assets and 23 exact UTF-8 spans to REA acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. It reuses the preserved spans from the script Unicode and terminal cursor evidence. The existing [Unicode source analysis](../../scripts/output-unicode/README.md) separately compares the retained provider's four width tables with the pinned `@xterm/addon-unicode11` 0.9.0 package. No new package or lockfile change is needed.

These are compiled-source observations. The retained renderer analysis exhausted its worker heap, so exact byte spans and alias joins do not constitute a complete semantic call graph. No reference JavaScript is evaluated, and no new REA runtime observation is claimed.

## Behavioral regression

[The fixture](../../../src/features/terminal/sessionUnicode.test.ts) loads the production session module. Its terminal delegates parsing, buffering, Unicode providers, writes, and disposal to the installed real xterm engine. The PTY, DOM opening, focus, fitting, preferences, and storage are isolated boundaries. Output enters through the production PTY event callback and decoder; restored output enters through the production saved-tab and history path.

The ten frozen cases cover panel emoji width, center-terminal adjacent emoji, a wrap boundary, a newer combining mark, ASCII, CJK, an existing combining accent, split UTF-8 event data, first-write history restoration, and sibling cleanup. Six width counterexamples and four passing controls are expected on the unchanged baseline. Setup failure is not a qualifying regression. Cursor coordinates, buffer row contents, and cell widths are public xterm observations, not addon-call spies.

[The frozen fixture](frozen-sessionUnicode.test.ts.txt) and [unchanged baseline session](baseline-session.ts.txt) retain the inputs for before-and-after comparison. The manifest records their identities and every existing compatibility fixture's assertion-body hash. Later dependency-boundary adaptations must not change those assertions.

## Checks and limits

Passed on Reason Cloud without running JavaScript:

```bash
python3 evidence/terminal/session-unicode11/verify_source.py \
  --original-dir .oc-tmp/scripts-audit-1222/originals
git diff --check
```

Both complete assets, 23 spans, ten caller and provider joins, ten frozen cases, the baseline snapshot, and the preserved existing assertion bodies passed static checks. These are not behavioral RED or GREEN results.

Not yet run at this milestone: the ten behavioral cases, frontend typecheck and build, macOS packaging, or consuming-main checks. No local Node, browser, native app, provider, or shell PTY runtime was started. No screenshot is supplied because this lane has no browser or native execution admission. Glyph rendering, fonts, native output delivery, installed-app identity, and side-by-side visual parity remain unverified even after isolated parser checks pass.

The Laziness Protocol keeps the planned production change to activating the already-installed provider in the existing initializer. Test Behavior, Not Implementation keeps the assertions on output columns and cell widths rather than addon construction. ScriptOutput, Setup, OSC8, input policy, focus, lifecycle, and backend behavior are outside the product diff.
