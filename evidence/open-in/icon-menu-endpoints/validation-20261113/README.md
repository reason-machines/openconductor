# Icon Open in Home and End

Conductor Rebuild adds endpoint navigation only to the icon Open in menu. Home focuses the first enabled row; End focuses the last. Both keys consume the event even when focus already rests on that endpoint. Already-prevented events and legacy IME code 229 remain ignored. Split-menu Home and End, wrapped arrows, Escape, app launches, and Copy path are unchanged.

## Source

The original [source packet](../source-v1/manifest.json) retains 22 REA-derived spans from Conductor 0.87.6 on Sven's Mac. Its asset SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, with retained evidence ID `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. The icon `P9` → `h2`/`Tm` → `oF`/`SLt` source path supplies Home/End endpoint handling and the legacy IME guard. The split menu retains its separate arrow handler. This is historical static source evidence, not a new observation of Conductor running.

Validation bound the unchanged candidate and original 14-case fixture to main `000948134a9685308703438f82250b1ae03f60c8`, assigned-branch head `3f50367a7cb9418c84c00982f2e8abf38f6f12d9`, and the original locked, checkout-owned dependencies. No installation or dependency restore ran. The archived manifest records all source and dependency pins.

## Actual regression and controls

The same command ran before and after the exact sealed patch:

```bash
timeout -k 5s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/features/openIn/iconMenuEndpoints.test.ts
```

- Baseline: exit **1**, all **14** collected, **10 passing controls** and exactly **four `ERR_ASSERTION` failures**, indices 1, 2, 6, and 7. Focus remained on Cursor instead of Finder or Copy path, or the endpoint key was not consumed.
- Candidate: exit **0**, the identical **14/14 passed**. The fixture and every assertion stayed byte-identical to the retained original.

Adjacent command: exit **0**, **53/53 passed**.

```bash
timeout -k 5s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/features/openIn/apps.test.ts src/features/openIn/switcher.test.ts src/features/openIn/iconMenuNumbering.test.ts src/features/openIn/menuArrowIsolation.test.ts src/features/openIn/settingsShortcutHint.test.ts src/palette/paletteOpenInTarget.test.ts src/palette/paletteOpenInLifecycle.test.ts
```

Typecheck: exit **0**, passed.

```bash
timeout -k 5s 180s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck
```

Every TAP run had zero skips, cancellations, and todos. All commands ran once, serially on Reason Cloud computer 355. The original runner started at **2026-11-13T01:44:13.321500Z** and released at **01:44:54.023809Z**, taking **40.702333 seconds** of the 650-second cap. The preceding guarded restoration took **0.055232 seconds**. Cleanup restored the original product, removed only the exact owned fixture, and recorded a clean tracked tree with no owned jobs, servers, or runtime. The exact tested product and fixture were then restored for publication, without rerunning tests.

[The original receipt](receipt.json) and [lossless raw proof](raw-proof.tar.gz) retain raw TAP, full commands, events, the immutable runner, the current-main manifest, and source staging guards. [The proof manifest](proof-manifest.json) records their hashes. No runtime retry or assertion amendment occurred.

## Verification limits

The component tests mock DOM focus nodes and native side effects. Browser focus, WKWebView behavior, physical keyboard input, installed app behavior, editor IPC, native parity, and visual acceptance are **not run**. No screenshot is supplied because browser and native execution were outside this serialized unit. Build, package, provider, server, and full-suite execution were not admitted locally. Peak RSS was not sampled; the recorded heap ceilings are limits, not measured consumption.

Source spans, tests, and typecheck do not prove packaged or installed behavior. Existing release owner 992 retains package inclusion and E1 retains native acceptance. A standalone ready PR targets main and may merge only after every enabled exact-head check passes.
