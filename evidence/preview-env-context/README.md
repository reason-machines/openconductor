# Preview environment context

Conductor Rebuild owns `RUN-PREVIEW-ENV-CONTEXT-1f-01`. The ledger cleared this correction sequentially after #972 merged. The three paths are ScriptsPanel's preview environment state and effect, the new previewEnvContext regression, and this note. Preview substitution, API arguments, process policy, Spotlight, history, Setup and completion stay unchanged.

## Fresh source and retained reference

Fresh main was checked at `aa9b44f5dcadceb5cef37d405f3ffbd9fd8fad8f` on 2026-11-11, the actual #972 merge. The panel still stores previewEnv without a workspace key. Its effect clears the object, awaits `api.previewEnv(ref)`, and publishes every response without checking disposal or request ownership. The real PreviewOpenButton receives options expanded with that object. Its mounted handler passes the resolved URL to `openUrl`.

The unkeyed App → WorkspaceView → PanelStrip → ScriptsPanel source joins remain unchanged from [the Spotlight context evidence](../spotlight-action-context/README.md). Fresh SHA-256 values are App `0d0921256b84b8a44e5b5704cf5c4549e34e66514c119e956179efdd2f101629`, WorkspaceView `9c7973c1680be27685f1d09007c5c5136a81e854ec886aa452457012de3ac0a9`, and PanelStrip `b95ab8eeee944a499f688655085c152deaf501f67ef45f9c3bbd4f6bff3d5c18`. ScriptsPanel after #972 is `0cce992995764c710298b62cd2faba9e1b4c878787b548dfe09400a6cdabf128`.

The existing authorized REA extraction is Conductor 0.87.6 from Sven's Mac. [The complete retained nro](../terminal/strip-toolbar/reference-nro.txt) is 29,165 UTF-8 bytes, renderer range `[7170202,7199367)`, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`.

The complete `Fc` callback at `[7177113,7177419)` is 306 bytes, SHA-256 `c83c709070b505d85d463e3491f4d5fb82451b03537041fb274ce93dc1d5db20`. It closes over `[a,o,r]`, reads ports with `o.id` and `r.localId`, and passes the current workspace name, path, root, target branch, port, local flag and user identity into URL resolution. This supports current-workspace data association only. It does not establish `xii` or `gEi` internals, port-allocation parity, native timing or observed native behavior.

No reference text is executed. No new acquisition, runtime access, native installation or REA setup ran. No new REA failure was encountered. Earlier extraction limits remain in [the scripts notes](../run-scripts/NOTES.md).

## Regression

`src/scripts/previewEnvContext.test.ts` mounts the real ScriptsPanel and PreviewOpenButton with the existing locked React test renderer. It loads production script API, state and URL helpers. Tauri IPC and events, portal placement, settings and unrelated UI boundaries are substituted. Only synthetic fixture variables are supplied.

The five cases exercise the real environment request and mounted Open handler:

- A's response must not supply B's URL variables while B's environment is pending.
- A's response must not replace B's already-resolved preview URL.
- An obsolete A request must not replace a newer A request after switching through B.
- A rejected obsolete request must leave B's URL unchanged.
- Same-workspace expansion and exact `run_script_preview_env` arguments stay unchanged.

The regression-only revision has no production diff. `node --experimental-strip-types --check src/scripts/previewEnvContext.test.ts`, inert retained-reference hashes, protected-file comparisons and `git diff --check` passed. Hosted RED is pending. Local component execution and typecheck have not run because this lane uses hosted regression execution without local dependency installation.

No browser screenshot is available. This is a source and mounted-component regression lane, not browser or native acceptance. Installed-Mac, real-provider and feature-specific visual checks are not run.

## Recheck inert reference identity

```python
from pathlib import Path
import hashlib

base = 7170202
nro = Path("evidence/terminal/strip-toolbar/reference-nro.txt").read_bytes()
assert len(nro) == 29165
assert hashlib.sha256(nro).hexdigest() == "906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123"
callback = nro[7177113 - base:7177419 - base]
assert len(callback) == 306
assert hashlib.sha256(callback).hexdigest() == "c83c709070b505d85d463e3491f4d5fb82451b03537041fb274ce93dc1d5db20"
print("PASS: complete retained nro and current-workspace Fc callback")
```
