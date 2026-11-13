# Existing ordinary-terminal appearance refresh

Authored by Conductor Rebuild.

## Change and source binding

An existing ordinary terminal now refreshes its xterm theme when the app's root appearance attributes change. Its `Live` entry owns one optional observer, uses its current input state for cursor visibility, and disconnects the observer through common disposal. The xterm instance, PTY, output, font, Unicode and input lifecycle are not replaced. The product diff is limited to three regions of `src/features/terminal/session.ts`. No helper, module, token value or ScriptOutput change is included.

The local baseline was HEAD `61a7eabc6c12e992f7fd8eddc7f29859704423bc`, containing fetched main `869d6efad0cdeb6a889538978f3e6416f0e3a2c2`. Its tracked tree equalled that main. Main was fetched again after execution and remained at that commit. Session baseline SHA-256 was `8f14cb4d0bc1fd9fa9f70fe7383b47d18f28dd65720f6ad15686c24540c8cac0`; the tested correction is `a078aa3fc5bbef6fde71d229e36eb8312e5f27e0651e117c1276ca7bdd1ab75b`.

[Retained real-Conductor REA qualification](source/source.json) records the original index/renderer asset identities, twelve source spans and lifecycle joins. The eSa / w9e / n9s / IJe chain subscribes to root-class changes, refreshes an existing terminal theme and retains cursor state. OpenConductor's own appearance boundary also uses `data-theme`, `data-color-palette` and `data-low-contrast`, matching the existing ScriptOutput attribute list. These are retained static shipped-source observations, not a fresh original-app or native execution. This unit does not establish reference callback behavior while detached. Our session-owned lifetime keeps hidden terminal colors current without claiming identical reference attachment internals.

## Preserved setup failure and syntax-only repair

The [original attempt](setup-v1/receipt.json) exited 1 before any of the twenty cases ran. Node 22 strip-only rejected a constructor parameter property. Its [raw output](setup-v1/red.tap) and [original frozen fixture](original-f1a6c42f.test.ts.txt) are preserved without claiming behavioral RED.

The [versioned repair](syntax-only.diff) replaces only that parameter property with an explicit readonly field and assignment. Reversing it reconstructs original fixture `f1a6c42fed2eec9552c93f007c79ae9478a425efbcaf216d99634888fe3f6ac1` exactly. All assertions and twenty cases remain unchanged. The executed v2 fixture is `874b585ecde9789842c862a7e7188826b29599151ab4cf8ac534d2f7202e68c5`.

Shared input `src/theme/terminalAnsiThemeFixture.ts` remains `aeca2daed1bbcc44cea8cb9484c503ce8b4a1e196a7aa9462cba214921874edf`. Root lock remains `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`.

## Bounded checks actually run

All three commands ran once, serially in the foreground on Cloud computer 352 (`00637189-5c55-416e-b457-ed7419fb739a`), nice 19, 768 MiB Node old-space cap, 120-second timeout, concurrency 1. No dependency install or retry occurred. Forty direct installed manifest identities matched the sealed preflight. The failing regression was committed as local `7dad85ba353f2f2299875ad00e3069d9cd8db8d5` before editing product source.

Identical RED and GREEN command:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/terminal/ordinaryThemeRefresh.test.ts
```

- RED reproduced the intended defect. Exit 1 at 13:57:36.474308–13:57:37.792643 UTC on 2026-11-12. Exactly sixteen palette-refresh assertions failed at line 148, each retaining its initial color instead of `fixtureColors.replacement`. Four controls passed. No setup or unexpected failure.
- GREEN passed. Exit 0 at 13:58:37.085593–13:58:38.191652 UTC. All twenty cases passed with identical frozen fixture and input bytes.

Exact twenty-five-file adjacent command:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/terminal/alternateClear.test.ts src/features/terminal/alternateLineEdit.test.ts src/features/terminal/bigTerminal.test.ts src/features/terminal/capture.test.ts src/features/terminal/clearRedraw.test.ts src/features/terminal/cursorState.test.ts src/features/terminal/find.test.ts src/features/terminal/font.test.ts src/features/terminal/nonrunningInput.test.ts src/features/terminal/resizeState.test.ts src/features/terminal/restore.test.ts src/features/terminal/scrollback.test.ts src/features/terminal/selectionAddToChat.test.ts src/features/terminal/selectionChatCaller.test.ts src/features/terminal/selectionChatFocus.test.ts src/features/terminal/sessionLineFeed.test.ts src/features/terminal/sessionUnicode.test.ts src/features/terminal/shellIntegration.test.ts src/features/terminal/shortcuts.test.ts src/features/terminal/spawnFailure.test.ts src/features/terminal/startingBody.test.ts src/features/terminal/tabList.test.ts src/features/terminal/terminal.test.ts src/features/terminal/writeQueue.test.ts src/features/terminal/terminalAnsiTheme.test.ts
```

Adjacent passed with exit 0 at 13:58:50.430943–13:59:07.170906 UTC. The actual count was 228 passed, not merely the historical prediction. No cases were skipped or cancelled in either passing phase. No timeout, OOM or resource warning occurred. The environmental experimental-proxy warning is retained in the raw logs.

[RED](red.tap.gz), [GREEN](green.tap.gz), and [adjacent](adjacent.tap.gz) logs are lossless gzip containers. [The manifest](manifest.json) records original and compressed hashes. [The execution receipt](ordinary-theme-refresh-1f-v2-grant.json) contains commands, phase times, exits, all case names, and before/after source pins. Its original `.oc-tmp` output names map respectively to these three durable log files. `execute-251b288e.py` is the preserved single-use local runner, not a CI hook or another runtime lane.

## Pressure gate and explicit release

The immediate pre-Node host memory-full PSI averages for 10/60/300 seconds were 0.00/0.05/0.18 percent, below the admitted 1/2 percent avg10/avg60 thresholds. At release they were 0.40/0.49/0.28 percent. These are rolling averages, not global allocator clearance. Exposed own-cgroup some/full averages and total stalls were zero in both snapshots. No own runtime jobs were visible in the execution namespace before or after the commands; bwrap/socat infrastructure was excluded explicitly. Memory, CPU and PID limit files were not exposed in that namespace and are reported unavailable, not unlimited. The PSI path was readable. This evidence does not establish capacity for UI or unrelated work.

The slot was explicitly released at **2026-11-12T13:59:23.092323Z**, before publication. No runtime work follows that release. Local typecheck and color lint were not admitted and are NOT_RUN; exact-head automatic hosted CI must prove them. No manual workflow dispatch is authorized by this unit.

## Verification limits and delivery

The fixture exercises production session code and real headless xterm public options, with synthetic DOM mutations and transport. It proves the stated appearance updates, unrelated-mutation guard, cursor/input preservation, existing instance retention and post-disposal behavior for these inputs. It does not prove mounted browser rendering, actual OS theme changes, `attachTab` reattachment, real PTY behavior or native visual parity. No screenshot exists because browser/server/native execution was excluded.

No build, provider, application launch, package, release or deployment was run. The fixed #992 cut is unchanged. OSC8 ten-case and stopped-Spotlight thirteen-case source packets remain separate and unexecuted under this grant. No Composer terminal-management scope is included.

Publication required ordinary reconciliation with the existing assigned remote branch `a9fe95056f3b79da87492199487d96249a608307`. A conflict-free normal merge preserved the entire verified tracked tree exactly as `a54c48a56bca577a730ce208bf0f61032cc47711`. No force push, reset, branch switch, rebind or runtime rerun occurred. The local regression-first commit remains in local history; server-side publication may consolidate local commits, so this evidence preserves their order explicitly.

Deliver as a ready standalone PR against main on the assigned branch. Every enabled exact-head check and triggered workflow must pass before merge. Conditional skipped/manual-only jobs are not passes. Source merge and eventual packaged/native acceptance remain separate.
