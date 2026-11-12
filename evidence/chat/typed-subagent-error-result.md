# Typed subagent error-result disclosure

Conductor Rebuild corrects `CHAT.TYPED-SUBAGENT-FAILED-RESULT-DISCLOSURE`. A failed typed Task or Agent with a nonempty returned string must retain its existing Formatted/Raw disclosure and copy control. The failure status remains separate from the returned text.

## Source and baseline

The recorded reference is Conductor 0.87.6, retained REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Renderer SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Companion index SHA-256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The original-byte source archive has SHA-256 `ece22a34c8682492a473c14664809b1c0514a7b48e3ed2dc79a6a6996f9d91dd`. The sealed mounted-fixture archive has SHA-256 `c92d4ae75f04c61f94b0ccecbece3574e8201e76620e24926a1c0eb63a50ac40`. All 30 manifest members passed byte-size/hash readbacks. Both full assets and nine exact retained spans passed source qualification; no complete proprietary asset is committed.

The retained registry/caller closure `D1o`/`L1o`/`O1o`/`Qpo`/`hIt` selects `bpo` for typed subagents and `Ypo` for the untyped fallback. `bpo` reads `toolResult.content` without an `is_error` gate. Its truthiness enables `Mu` disclosure; `yZe` preserves an accepted string, which supplies Formatted, Raw, and copy. `bpo` has no independent error row. The complete retained spans were rechecked, not executed:

- `bpo`: UTF-8 half-open `[7849789, 7852432)`, SHA-256 `2bc0c792897bdcdacfd3e7f5d27e4348c807edee2a95f27ffa0f786f859623e5`.
- `yZe`: `[7784153, 7784357)`, SHA-256 `cdae59170844aa87bf6d03fe1d14d0b4cbd84819163be066243a90fff7237307`.
- `Mu`: `[7795403, 7798463)`, SHA-256 `2a88a2516341f7a98563d2f4b2a602ac9c0acc584282cd01cf54a011e3e4231d`.

Fresh containing main `877aacbbec9084d4f71dd2aaf1bb0f3266a553f5` includes #1161's `97745aae`. The assigned branch consumed it by a normal non-destructive merge, retaining its identity and history. `python3 .ara-state/tmp/requalify-typed-subagent.py` passed 59 static checks, 30 archive readbacks, nine spans, and thirteen current source snapshots. The only packet-to-main difference was the accepted TaskList `parseTaskList(output)` to `parseTaskList(result)` correction. The exact typed dispatch was unchanged. The tracked product matched this main before RED.

Static joins cover local Claude result/failure separation, Reason wire/frontend events, reducer, view, Transcript forwarding, row selection, and the typed consumer. These joins establish source behavior, not an observed native/provider emission.

The original REA semantic renderer analysis exhausted heap and skipped the renderer. This historical gap remains: no fresh semantic pass, installed-app identity, original-app execution, or native parity is claimed.

## Frozen regression

The new test and input are unchanged copies of the sealed fixture:

- `src/features/chat/typedSubagentErrorResult.test.ts`: SHA-256 `c02bef14a8da8b334303870fc90fe33bad288f12f01dea3b58c00ae7c3e64dc3`.
- `src/features/chat/typedSubagentErrorResult.inputs.json`: SHA-256 `822dd89682e766b9dfa4fae06bdd63cb2e9984ca4f368cf2f54a9198dceea5ce`.

Sixteen cases start at real `applyReasonPayload`, then use `applyChatEvents`, `buildRows`, and mounted production `ConductorToolRow`. The fixture retains actual row selection, `SubagentRow`, result conversion, Markdown, RowShell, and CopyIcon. Only clipboard and copy-confirmation timers are fake boundaries. Unrelated link/opener/highlight dependencies throw if reached.

Two counterexamples cover failed Task and Agent with type Explore and nonempty strings. Fourteen controls cover successful typed results, pending without output, empty failed/successful results, and missing/empty/general-purpose types for both names. Assertions cover failure status and unchanged result bytes, collapse/expand, typed title/model, default Formatted text, exact Raw text, copy without toggling, collapse/reopen retaining Raw, return to Formatted, and the untyped error fallback.

## Actual serialized execution

All local commands ran once in the foreground on Cloud computer 352 (`00637189-5c55-416e-b457-ed7419fb739a`), under ACC grant `483b72fb-c184-47cf-8d65-6aa58c11cd8c`, with a 120-second bound each. Existing dependencies were used; no installation or restoration occurred. The accepted preflight reported 28,257 MiB available RAM, 45.349 GiB free home disk, and consecutive five-second CPU busy intervals of 15.388% and 17.907% with low iowait.

### RED reproduced the intended defect

```bash
timeout 120s node --test --test-concurrency=1 src/features/chat/typedSubagentErrorResult.test.ts
```

At 2026-11-12 10:56:10–10:56:11 UTC, before any product edit, the command exited 1: 16 tests, 14 passes, exactly two failures, no skips/cancellations. Both `failed-task` and `failed-agent` failed `TYPED_SUBAGENT_DISCLOSURE_*`: actual `aria-expanded` was `undefined`, expected `false`. The production row had no expandable result body. This was an intended rendered-behavior failure, not a setup, dependency, import, or timeout failure. The frozen regression was committed before the fix as `3d949a9648075528674cd6e60cef5f7fbe1e50e7`.

### GREEN passed with the same fixture

The behavioral correction changes only the typed dispatch argument from `result={output}` to `result={result}`. At 10:56:36–10:56:37 UTC, the identical command and test/input bytes exited 0: all 16 passed, zero failures/skips/cancellations. In particular, the actual production Formatted/Raw/copy and close/reopen behavior ran for both failed typed strings.

### Adjacent checks passed

```bash
timeout 120s node --test --test-concurrency=1 src/features/chat/typedSubagentLinks.test.ts src/features/chat/conductorTools.test.ts src/features/chat/toolErrorRetry.test.ts src/features/chat/taskListErrorResult.test.ts src/features/chat/taskUpdateErrorResult.test.ts
```

At 10:56:45–10:56:50 UTC, the one admitted sibling pass exited 0: **72 tests passed**, zero failures/skips/cancellations. Existing sibling fixtures remained unchanged.

### Initial typecheck found the last reader's dead binding

```bash
timeout 120s npm run typecheck
```

At 10:56:59–10:57:16 UTC, the admitted one-shot typecheck exited 2 with exactly:

```text
src/features/chat/ToolRows.tsx(876,9): error TS6133: 'output' is declared but its value is never read.
```

The typed dispatch was the last reader of MoreRows' success-only `output` after the earlier independent TaskList/TaskUpdate corrections. Passing the original result leaves that local binding dead. The separate `Row` binding is still used and is outside this change. No typecheck retry ran under this grant. The ordinary slot was explicitly released at 10:57:36 UTC after all commands terminated; an owner-job scan found no lingering Node/npm/tsc/timeout job. Root receipt `b118a19d-d1f8-4c93-9543-a88f5205892a` and ledger receipt `55255cbf-8a1c-45e1-907e-6f22dc80d0de` reconciled the necessary removal of only that pure, now-dead MoreRows binding within the existing four-file lease. The separate Row binding and every other arm remain untouched. This initial failure is retained rather than relabeled as a passing check.

At 11:03:12 UTC, a whole-file static byte comparison passed: final ToolRows equals the qualified main plus exactly the typed argument correction and that single dead-binding deletion. Its SHA-256 is `ad411f8f3f0aaed996d4417e91ab72054f7ae8f54225846cc7bdc447c751fe89`. Both frozen files and the root lock remain unchanged. No behavior or typecheck rule was weakened. Under separate ACC grant `d89ccf86-94d1-42e6-b802-208d02a17393`, the same `timeout 120s npm run typecheck` command ran exactly once at 11:05:25–11:05:48 UTC and **passed**, exit 0, `tsc --noEmit` with no diagnostics. The approved ToolRows, both frozen files, and root lock hashes were checked immediately before this command. HEAD `7144d24a859e3e54cb13564d9987842d626c6d2e` commits the same approved source tree plus documentation. No RED/GREEN/sibling rerun occurred after the pure dead-binding deletion. The source-only whole-file comparison establishes that no other product behavior was edited; it is not an additional mounted run.

The corrected raw log is `.ara-state/tmp/typed-subagent-typecheck-corrected.log`, SHA-256 `ada526f46c3b419d6debebc1927127db90def4d2996a690afc48de6a27985dd8`. At 11:06:04 UTC the corrective slot was explicitly released to ACC, root, and ledger; the owner-job scan again found no lingering Node/npm/tsc/timeout jobs.

Raw local logs remain in the Session's `.ara-state/tmp/typed-subagent-{red,green,adjacent}.tap` and `.ara-state/tmp/typed-subagent-typecheck.log`. SHA-256 identities, respectively:

```text
e5c9a8ef0d6fc0069d6b4a71103474c4ffc19e6cf17b06676d3d780b495be130
482f3023e6aa14fd2cb1ee442fe8d56466fec5bb7f8ce9fb2e709930822065fc
46b39fa2f1b206de52d9809ef80227d7101207387d7f68870fa7b2f41c44c8f4
5dd4f742dc62b4a3c1b1e983bfd91e24f129ad6e85295989894dac6f26551cd1
```

Root lock SHA-256 remained `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`. Both frozen hashes were identical before RED and after all admitted commands. `git diff --check` passed.

## Scope and gaps

The lease contains only ToolRows' typed-subagent dispatch and the reconciled dead local binding deletion, the two new frozen files, and this evidence document. Parser, SubagentRow, shared behavior, generic fallback, links, transport/backend, other tool arms, sibling tests, workflows, manifests, and styles remain unchanged. GetTerminalOutput stays with its source owner. Frozen #847/#1098 and the fixed #992 package cut are untouched.

Delivery is a ready standalone PR against main. The separately admitted corrective typecheck passed before publication. Every enabled exact-head automatic check must pass before merge; skipped/manual-only workflows are unrun, not passes. Existing release ownership is retained, with no duplicate package/watch work.

No browser, app/server, native, real-provider, Rust execution, E2E, local build, package, workflow dispatch, or deployment check ran. There is no screenshot because this lane admitted only headless mounted checks. Component behavior is verified for the frozen inputs; native appearance, geometry, original-app side-by-side parity, installed behavior, provider emission, packaging, and release inclusion remain unverified.
