# Structured terminal output disclosure

Conductor Rebuild fixes `CHAT.GETTERMINALOUTPUT-STRUCTURED-RESULT-CONSUMER`.

## Cause and correction

The adapter, reducer, and view preserve structured `rawResult` separately from flattened `result`. `Transcript` already passes both to `ConductorToolRow`. The default `Row` delegation dropped `rawResult`, so `MoreRows` called `terminalOutput` with only the flattened string.

A raw text-block array containing `123` therefore reached the helper as string `123`. Parsing that string produced a number, which correctly has no terminal disclosure in the original string branch. The array branch must instead disclose literal `123`. The same loss hid other JSON-shaped literals and decoded nested block text a second time.

The fix forwards the existing raw prop through the default delegation and terminal arm. `terminalOutput` reads supplied arrays directly, parses supplied strings once, and uses flattened `result` only when raw content is absent. Unsupported supplied objects do not fall back. A genuinely raw string `123` remains hidden. Other tool arms, the separate Row output binding, and the merged typed-subagent dispatch are unchanged.

Fix Root Causes kept the correction at the dropped prop and terminal consumer, rather than changing the provider or global parser.

## Retained original source

Reference acquisition is Conductor 0.87.6, REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

- Complete renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Companion index SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Retained packet SHA-256 `4fd56b87a3c946570231201136eb3a919c34fb28800565ae01bde8bac37d2d96`.

The retained `ROo → TOo → ioi → hIt` route and `D1o`/`L1o`/`O1o`/`Qpo` registry select `Dpo` for `mcp__conductor__GetTerminalOutput`. `Dpo` distinguishes raw strings from raw arrays. Its complete `jpo`/`Mpo` and `Lpo`/`Ppo` predicates select text blocks and join their text with newlines. This branch does not gate on error status. Complete retained span offsets and hashes are in [source qualification](terminal-output-raw-result/source.json). No complete proprietary asset is committed or executed.

The original REA semantic renderer pass exhausted heap and skipped the asset. This is retained-byte source closure, not a successful new semantic pass, fresh installed-app identity, native observation, or real-provider emission. That gap remains open.

## Qualified baseline and frozen regression

The packet was qualified at containing main `1286465cb69763efaa1367c49fdebc88ab4da86d`. Before this execution, the same assigned branch consumed fetched main `582028e6607cf943441bde6f6a2ce709fe8a60cd` by a conflict-free ordinary merge. Baseline HEAD `f94b065a24ca5fa6ef166d3efef51a02467b65b0` had the same tracked product tree as that main. All eleven producer-to-consumer snapshots, seven neighboring fixtures, 35 manifest entries, 36 regular archive files, and sixteen retained spans matched their sealed identities.

The unchanged 22-case fixture uses real `applyReasonPayload`, `applyChatEvents`, `buildRows`, and mounted production `ConductorToolRow`. It observes status, title, note, disclosure clickability, rendered text, and repeated close/reopen behavior. Adapter input and provider transport are synthetic boundaries. Unrelated dependencies throw if reached. The fixture does not mount the complete Transcript parent or prove Rust/provider execution.

Frozen identities before RED and after all admitted commands:

```text
terminalOutputRawResult.test.ts    cf4cd97bd5b3d3928dc47128a501f354d4f04dbf0fe8d5347ae325fbbd64a55a
terminalOutputRawResult.inputs.json f74e08121b76dc08240926a0054f3aca5349d50e46856b18a4334683b9cac54c
package-lock.json                  0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a
```

Fourteen counterexamples cover success and error for arrays containing number, boolean, null, object, array, quoted-string, and encoded-text-block literals. Eight controls cover ordinary arrays and strings, hidden raw string `123`, decoded raw-string blocks, empty arrays, pending output, missing raw content, and unsupported raw objects.

## Actual bounded execution

All five stages ran exactly once, serially in the foreground on Cloud352 `00637189-5c55-416e-b457-ed7419fb739a`, under ACC admission `924a4e59-1613-4a9e-9115-8c8dfaf7b016`. No runtime retry or assertion change occurred. Exact timestamps, durations, commands, and hashes are in the [terminal release receipt](terminal-output-raw-result/release.json). Each log JSON stores the exact UTF-8 output string and its byte hash, including original whitespace.

### Dependency installation passed

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 180s npm ci --ignore-scripts --no-audit --no-fund
```

At 12:57:50.087–12:58:00.061 UTC on 2026-11-12, exit 0, 9.972 seconds. Static metadata checks verified all 388 nonoptional locked packages and the installed hidden lock. React, react-dom, and react-test-renderer were all 18.3.1. TypeScript was 5.9.3. Product manifest and root lock were unchanged. [Install log](terminal-output-raw-result/install.log.json) and [metadata](terminal-output-raw-result/installed.json).

### RED reproduced exactly fourteen intended failures

Identical command for RED and GREEN:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/terminalOutputRawResult.test.ts
```

Before product edits, 12:58:29.006–12:58:29.827 UTC, exit 1, 0.818 seconds. Exactly fourteen named `TERMINAL_RAW_RESULT_*` assertions failed and all eight controls passed. Twelve failures lacked expected disclosure, while the two encoded-block cases disclosed decoded text instead of the literal array text. No setup or control failure occurred. [RED log](terminal-output-raw-result/red.log.json).

After the minimal Rows/helper correction, 12:59:39.929–12:59:40.724 UTC, exit 0, 0.793 seconds. All 22 passed with no skips, cancellations, fixture changes, or command changes. Raw text-block array `123` disclosed literal `123`; raw string `123` remained hidden. [GREEN log](terminal-output-raw-result/green.log.json).

### Seven adjacent files passed

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/conductorTools.test.ts src/features/chat/taskGetErrorResult.test.ts src/features/chat/taskListErrorResult.test.ts src/features/chat/taskUpdateErrorResult.test.ts src/features/chat/typedSubagentErrorResult.test.ts src/features/chat/typedSubagentLinks.test.ts src/features/chat/genericToolLabels.test.ts
```

At 12:59:48.619–12:59:55.214 UTC, exit 0, 6.592 seconds. All 89 passed, with no skips or cancellations. Existing fixture hashes stayed unchanged. [Adjacent log](terminal-output-raw-result/adjacent.log.json).

### Typecheck passed

```bash
env NODE_OPTIONS=--max-old-space-size=2048 nice -n 19 timeout --kill-after=5s 120s npm run typecheck
```

At 12:59:58.503–13:00:19.571 UTC, exit 0, 21.066 seconds. `tsc --noEmit` produced no diagnostics. ACC admitted this unit's 2048 MiB compiler cap before execution. No heap increase or retry occurred. [Typecheck log](terminal-output-raw-result/typecheck.log.json).

The ordinary slot was explicitly released at 13:00:38.406 UTC. No own Node, npm, tsc, Vite, Cargo, or rustc process was visible then. The process observation is namespace-local, not a computer-wide claim. `git diff --check` passed.

## Delivery and limits

Ready standalone PR against main, not stacked. Every enabled check and triggered workflow on the exact published head must pass before merge. Skipped or manual-only jobs are unrun, not passes.

No screenshot exists because browser, app/server, and native execution were excluded from this bounded lane. Mounted component behavior is verified for the frozen inputs. Pixels, geometry, installed behavior, full Transcript integration, side-by-side native parity, Rust execution, real-provider emission, E2E, local build, package, workflow dispatch, and deployment are NOT_RUN.

The fixed #992 release cut and frozen #847/#1098 remain unchanged. Release inclusion stays deferred with the existing release owner, Session `992a715e-aafd-49b0-88ba-9cabca1a3126`. Native acceptance stays with its existing owner. This change adds no package executor or release watcher.
