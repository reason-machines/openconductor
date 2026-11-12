# Run output cursor options

Conductor Rebuild checked main `021aeaa4027770258b4daae127bc829d1575d0ab` against the retained real-app REA renderer and index assets from evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

## Source contract

The Run producer creates an `OJs` run surface. `xEi` writes its config through the `K2` registry, imported as `AO`. `aSa` reads the stored configs and `lSa` selects `rSa`. That Run wrapper calls `w9e` without `showCursor`, so the shared hook defaults it to true. `dno`, `uno` and `cno` pass the value to `lno`. The terminal constructor enables blinking and `IJe` uses the foreground cursor color with a background-colored cursor accent. The hook refreshes that theme on palette changes.

The Setup component `gno` explicitly supplies `showCursor: false`. Run does not hide the cursor option when input is disabled after exit. Cursor visibility must therefore follow the output role, not `onInput` availability. The current component is shared by Setup, Spotlight and Run; all three currently receive non-blinking, transparent cursor configuration.

These are source-option differences. They do not demonstrate visible cursor drawing, blinking, native focus, DEC cursor modes or inactive-cursor appearance.

## Frozen test-first baseline

`src/scripts/outputCursor.test.ts` mounts the actual current `ScriptsPanel` and `ScriptOutput`, with real React effects and current production source dependencies. It mocks the xterm constructor, fit addon, DOM observers, native I/O and unrelated presentation boundaries. The standalone control mounts the actual `ScriptOutput` with an input callback and no role override.

Eight sealed cases cover:

1. Running Run foreground cursor and background accent at the xterm boundary.
2. Blinking requested at construction.
3. Stopped Run foreground configuration while stdin remains disabled.
4. A running-to-stopped transition preserving the same Terminal instance and accumulated output.
5. The rendered output click calling public `focus()` without changing cursor policy.
6. Palette refresh using current cursor and accent tokens.
7. Read-only Setup retaining transparent configuration after palette refresh.
8. Default standalone output with input retaining OpenConductor's transparent configuration independently of stdin availability.

The final control preserves OpenConductor's existing default; it is not a claim about the original shared hook's default.

No product file changed for this first publication. The expected baseline signal is six option assertions failing and both transparent-configuration controls passing. This expectation is not a test result. A loader, typecheck or dependency failure does not qualify as behavioral RED. Product correction waits for actual hosted assertion evidence; the eight cases then stay byte-identical.

## Checks

Run the read-only source verifier with the retained complete assets:

```bash
python3 evidence/scripts/output-cursor-1f/verify_source.py --original-dir .oc-tmp/scripts-audit-1222/originals
sha256sum -c evidence/scripts/output-cursor-1f/fixture.sha256
git diff --check
```

The source verifier checks two complete original identities, 18 exact unique retained spans, baseline product snapshots and the frozen eight-case hash. It does not evaluate the retained JavaScript or execute the product. The test loader reads live checkout files and has no historical source-hash gate; the pinned baseline snapshots are evidence, not replacement candidate code.

Ordinary automatic hosted CI runs `node --test "src/**/*.test.ts"`. No manual workflow dispatch or rerun is requested. Hosted results have not yet been observed for this fixture.

## Limits and ownership

No local Node, Rust, browser, provider, native app or installation ran. No screenshot is available because this lane has no browser or native admission. Mocked constructor/theme and public-focus observations are not native or visual acceptance. No full-app, keyboard, paste, selection, clipboard, font or DEC behavior is established.

Scope is script output cursor policy only. Settings LoginTerminal, shared terminal cursor state, font readiness, geometry, scripts APIs, backend processes and the separately owned disclosure repair are excluded. The minimum future correction needs a Run-only callsite role plus ScriptOutput cursor configuration, and must preserve Setup and unchanged Spotlight defaults. Every exact-head check must pass before merge; consuming-main package and CI verification follow separately.
