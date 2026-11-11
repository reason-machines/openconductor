# Unicode 11 widths in Run and Setup output

Conductor Rebuild enables the pinned upstream Unicode 11 addon in `ScriptOutput` before loading the fit addon or opening the terminal. This changes emoji widths and newer combining-mark widths without changing OSC8 links, plain-text links, terminal input, or session lifecycle.

## Retained source evidence

REA acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` retained the real Conductor application's compiled renderer and shared index assets. [The source receipt](source-receipt.json) records both complete asset hashes and 21 exact UTF-8 spans.

The Setup and Run surfaces reach `gno`, then `w9e`, then the shared terminal factory `lno`. That factory enables proposed APIs, loads `Wyr`, and selects `unicode.activeVersion = "11"`. The renderer imports `g8 as Wyr`; the index exports `Vbt as g8`. `Vbt` registers the provider `Kbt`, whose version is `11`. These are compiled-source observations, not runtime observations.

The four numeric range tables in `@xterm/addon-unicode11` 0.9.0 match the retained provider's four tables exactly. The source receipt records 214 BMP combining ranges, 61 BMP wide ranges, 117 supplementary combining ranges, and 53 supplementary wide ranges. The pinned package tarball's SHA-512 matches the lockfile integrity. No reference application code is executed by these checks.

Main `248b6c359c830c6ac5e050721bae18e44e168068` does not select a Unicode provider in `ScriptOutput`. Installed xterm 6.0.0 defaults to Unicode 6. Its source tables assign one column to the selected emoji and newer combining mark. The retained Unicode 11 tables assign two columns to those emoji and zero to the combining mark. Behavioral confirmation must come from the hosted differential run, not this source comparison.

## Actual-component regression

[The nine-case fixture](../../../src/scripts/outputUnicode.test.ts) mounts the real `ScriptOutput` with React Test Renderer. Its terminal boundary delegates options, addon lifecycle, input parsing, buffers, writes, and disposal to the installed real xterm engine and the real Unicode addon. DOM opening, rendering, fitting, observers, and unrelated hooks are boundary substitutes. This is not a browser, native terminal, font, or clipboard test.

Four intended counterexamples check one emoji's cursor column, adjacent emoji columns, a wrap boundary, and a newer combining mark. Five controls cover ASCII, CJK, an existing combining accent, empty output, and replacement with cleanup. The nine prepared assertion bodies remain unchanged. The fixture adapter delegates addon management to real xterm and supplies a disposable fit boundary.

The [replay](replay.py) uses an immutable snapshot of this actual component and fixture. It reverses only the four-line Unicode product patch and checks the exact baseline product hash. Both phases use the same installed dependency tree and byte-identical fixture. The classifier requires the four named width failures with their exact actual and expected values, plus five passing controls, before requiring nine candidate passes. Setup errors cannot count as RED. Ordinary frontend unit CI separately runs these nine assertions against the current component. The replay is labelled historical so future unrelated component changes do not invalidate an established baseline.

The existing copy regression is kept separate. Its historical product and transported fixture remain byte-identical to #1039. Only the current copy fixture's Unicode dependency boundary changes; all nine copy assertion bodies remain unchanged.

## Checks and limits

Passed on a Reason cloud computer without executing Node:

```bash
python3 evidence/scripts/output-unicode/verify-source.py \
  --original-dir .oc-tmp/scripts-audit-1222/originals
python3 -m unittest discover -s evidence/scripts/output-unicode -p test_replay.py -v
git diff --check
```

The source check verifies both original asset hashes, all 21 retained spans, the frozen component and fixture hashes, and equality of all nine current test bodies. Five synthetic classifier tests pass. These are not behavioral RED or GREEN.

The admitted hosted frontend-unit job runs:

```bash
python3 evidence/scripts/output-unicode/replay.py --out-dir "$RUNNER_TEMP/output-unicode-replay"
```

It prints complete before and after TAP plus product, fixture, dependency-lock, and TAP hashes. Behavioral results, typecheck, build, browser, native, font rendering, and side-by-side parity remain unverified until their respective checks actually run. No screenshot is supplied because this lane has no browser or native admission. No local runtime, install, native executor, or E1 slot is introduced. Existing disposal, cancellation, and OSC8 queue order is unchanged.

The original REA renderer analysis exhausted its worker heap. Retained byte-span evidence is not a complete semantic call graph. No additional REA runtime observation is claimed.

The Laziness Protocol keeps the product fix to provider activation in the existing effect. Prove It Works keeps source checks, hosted parsing behavior, package inclusion, and native rendering as separate claims.
