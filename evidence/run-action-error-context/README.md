# Ordinary Run action error context

Conductor Rebuild owns `RUN-ACTION-ERROR-CONTEXT-1f-01`. The ledger cleared only ScriptsPanel's generic `act()` catch, `src/scripts/runActionErrorContext.test.ts`, and this note after #977 actually merged. No pending state, command/API, stop policy, process lifecycle, history, Setup, Spotlight, completion or preview URL changes are included.

## Current source and retained reference

Fresh main was checked at `7af2b95aa74dff985fb6b745f7cc080287d35ea6` on 2026-11-11. It contains #977's actual merge `697ba00b2fec7ea4151b771603f57b3f6874191d`. The ordinary Run toggle and RunSplitButton task-picker callback call `act()`. Its catch publishes every rejection into the currently mounted panel without checking which workspace issued it. Setup and Spotlight already use `displayedWorkspaceId` in their own catches; they are unchanged.

The App → WorkspaceView → PanelStrip → ScriptsPanel JSX edges remain unkeyed on workspace changes. Fresh SHA-256 values are App `0d0921256b84b8a44e5b5704cf5c4549e34e66514c119e956179efdd2f101629`, WorkspaceView `9c7973c1680be27685f1d09007c5c5136a81e854ec886aa452457012de3ac0a9`, PanelStrip `b95ab8eeee944a499f688655085c152deaf501f67ef45f9c3bbd4f6bff3d5c18`, and pre-fix ScriptsPanel `6440ca17f56a604eee9f7c392c70cfdb7b8fba2e435b0d9c0a391447299f5060`.

This change reuses the authorized REA extraction of Conductor 0.87.6 from Sven's Mac. No new acquisition or reference execution ran. The renderer identity, index-to-renderer alias closure and process-store producer evidence remain in [Run admission](../run-admission/README.md), [Run selection history](../run-selection-history/README.md), and [the scripts investigation](../run-scripts/NOTES.md). Existing REA graph/range and literal-retention limitations remain applicable; no new REA failure was encountered.

The complete retained [nro](../terminal/strip-toolbar/reference-nro.txt) has renderer UTF-8 range `[7170202,7199367)`, 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. Rehashed hooks `[7172036,7172821)` are 785 bytes, SHA-256 `a8d21231a968ffc3193d8fc40bfcb8f40336a3fe5837992d4e78db81ecdabaac`. They read process, busy, state, run ID and outcome by local workspace and task.

Complete start/stop callbacks `[7183537,7184843)` are 1,306 bytes, SHA-256 `2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4`. Stop passes the local workspace and shown/selected task to `q_.killProcess`. Start passes `localWorkspaceId:r.localId`, workspace path, repository ID and task identity to `q_.startProcess`. Its unsuccessful result calls either `er.error(Hf.error,t)` or the structured error form with `localWorkspaceId:t`.

These observations establish workspace/task association, not Conductor's observed native timing, every late-rejection policy, or error-renderer internals. The regression targets an OpenConductor bug in the actual mounted command handler; it does not claim native parity.

## Mounted regression

The test uses the existing locked React test renderer to mount production ScriptsPanel and RunSplitButton. It loads the production API, model and presentation helpers. Tauri IPC/events, portal placement, icons and unrelated settings/keybinding boundaries are substituted; no copied action handler is tested.

For ordinary start, stop and task-picker start/restart, the same three cases exercise actual mounted callbacks:

- Start A's command, switch the mounted panel to B, then reject A: B must display no A error.
- Start A, switch to B, reject B's own command, then reject A: B's current error must remain unchanged.
- Reject without switching: the visible error and exact `run_script_start` or `run_script_stop` IPC payload must remain unchanged.

The task-picker case drives RunSplitButton's actual mounted `onPick` callback. It does not claim a native menu interaction. Initial mount is also checked not to issue a script command.

`node --experimental-strip-types --check src/scripts/runActionErrorContext.test.ts`, retained-source hashes, fresh source joins, and `git diff --check` passed. Fresh main was rechecked at `1b7577234` after hosted RED; ScriptsPanel is byte-identical to the pre-fix version described above.

Hosted RED at `06f6a2f888b1ed755f040a78501ad2a21b405cd8` is confirmed in [CI run 42944857887, unit job 130275088913](https://github.com/reason-machines/openconductor/actions/runs/42944857887/job/130275088913). The six start/stop/pick stale-workspace cases fail with A's error displayed in B or replacing B's own error. All three same-workspace/error/IPC controls pass. The full frontend run reports 2,278 tests, 2,272 passed, and exactly those six failed. The typecheck/build job's test phase reports the same six failures; these are intended behavior failures, not a TypeScript compilation error.

The correction reuses the existing `displayedWorkspaceId.current === wsId` check in generic `act()`'s catch. All nine regression cases are unchanged. Hosted GREEN is pending publication of the correction. Local component execution, dependency installation and typecheck/build are not run in this CPU-constrained source/hosted-regression lane.

No browser screenshot is available because this lane does not admit browser/native runtime execution. Installed-Mac, real-provider and feature-specific visual acceptance are not run.

## Recheck retained reference identity

```python
from pathlib import Path
import hashlib

nro = Path("evidence/terminal/strip-toolbar/reference-nro.txt").read_bytes()
assert len(nro) == 29165
assert hashlib.sha256(nro).hexdigest() == "906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123"
for start, end, expected in [
    (7172036, 7172821, "a8d21231a968ffc3193d8fc40bfcb8f40336a3fe5837992d4e78db81ecdabaac"),
    (7183537, 7184843, "2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4"),
]:
    span = nro[start - 7170202:end - 7170202]
    assert len(span) == end - start
    assert hashlib.sha256(span).hexdigest() == expected
print("PASS: retained complete nro and workspace-associated Run hooks/callbacks")
```
