# Restore workspace Run selection from retained history

Conductor Rebuild owns this source-only correction. Fresh upstream main was re-read at `c63c60a58` on 2026-11-11; ScriptsPanel, the scripts model and API were unchanged from `50b0a4403ee26d315775869b35958bfe28291ae2`. The ledger released the selection/history hunk after #956 and #962 actually merged. This PR is based on main, not another PR.

## Retained reference and limits

The earlier authorized REA investigation read Conductor 0.87.6 on Sven's Mac. This change reuses inert retained text only. No app acquisition, extraction, reference execution, browser, native or installed-app action ran.

The renderer is `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its complete `nro` is [retained in the repository](../terminal/strip-toolbar/reference-nro.txt), UTF-8 `[7170202,7199367)`, 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`.

The matching index `index-BGEQ8YjU.js` is 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, as recorded in [the asset manifest](../frontend/tauri-assets-manifest.json). The complete Ju/AI declarations below came through authorized Session text, source `cba95b1e-59c0-4570-8041-4cef09a6501d`, revision `25844480`, in [the retained-source owner's investigation](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46). UTF-8 range `[2880968,2882258)`, 1,290 bytes, freshly computed SHA-256 `5863dcf6bffa630223a97be94ae9afa6d72ac032859fbdc60599b6e7f6073bc2`. Historical hash fields were redacted in that transfer; this digest verifies the received literal, not a newly acquired full index.

```javascript
const Ju=nr()(Gy(t=>({activeTaskId:void 0,hasHydrated:!1,workspaceHistories:new Map,recordRun:({localWorkspaceId:e,taskId:s})=>{t(n=>{const r=n.workspaceHistories.get(e),i=[s,...r?.taskIds.filter(a=>a!==s)??[]].slice(0,Kde),o=new Map(n.workspaceHistories);return o.set(e,{taskIds:i,activeTaskId:s}),{activeTaskId:s,workspaceHistories:o}})},clearWorkspaceHistory:e=>{t(s=>{if(!s.workspaceHistories.has(e))return s;const n=new Map(s.workspaceHistories);return n.delete(e),{workspaceHistories:n}})},clearAll:()=>{t({activeTaskId:void 0,workspaceHistories:new Map})}}),{name:DIt,storage:PE(()=>i2({subsystem:LIt,sizeLimit:NIt})),partialize:t=>({activeTaskId:t.activeTaskId,workspaceHistories:Array.from(t.workspaceHistories.entries())}),merge:(t,e)=>{const s=BIt(t);return{...e,activeTaskId:s.activeTaskId,hasHydrated:!0,workspaceHistories:new Map(s.workspaceHistories)}}})),AI={useActiveTaskId(){return Ju(t=>t.activeTaskId)},useHasHydrated(){return Ju(t=>t.hasHydrated)},useWorkspaceActiveTaskId(t){return Ju(e=>t?e.workspaceHistories.get(t)?.activeTaskId:void 0)},useWorkspaceTaskIds(t){return Ju(e=>t?e.workspaceHistories.get(t)?.taskIds??uV:uV)},recordRun:t=>Ju.getState().recordRun(t),clearWorkspaceHistory:t=>Ju.getState().clearWorkspaceHistory(t),clearAll:()=>Ju.getState().clearAll()};
```

Ju.recordRun moves the task ID to the front of that workspace's history and records its active task ID. AI exposes workspace history and active-ID readers. Its persistence declaration serializes the workspace histories. Persistence internals are not reverified here.

The same receipt contains index export `AI as gT,ARt as gU`, UTF-8 `[3484114,3484132)`, 18 bytes, received-literal SHA-256 `54e667435244e5187f46caa8d8dbfd0b252fd4f9843bfcd23d052708358361df`. The accepted index-to-renderer import closure `gT as tX, gU as q_` is recorded in [the existing admission evidence](../run-admission/README.md). That historical alias receipt is reused, not described as a new full-artifact verification.

The complete V9i and Yio helpers are retained in [the earlier renderer investigation](https://reasonmachines.com/agents/552cf5a8-28dd-43bc-9997-fed8ad9316f7), source `227e63fa-e4f8-4b59-b911-635dfa9798d6`, revision `23708511`. Their received literals are:

```javascript
function V9i({appActiveTaskId:t,defaultTask:e,tasks:n,workspaceTaskIds:i}){for(const r of i){const o=n.find(a=>a.id===r);if(o!==void 0)return o}if(i.length===0&&t!==void 0){const r=n.find(o=>o.id===t);if(r!==void 0)return r}return e}
```

V9i is 233 bytes, SHA-256 `fd7211bef2eb6b8b2aa76265acc10b80503b0deb1e8dad8e0c51fc60b0058570`. It chooses the first history ID still present in the task list. App-active fallback applies only to an empty workspace history, otherwise the default is returned if no historical ID survives. This correction adds no app-global selection store.

```javascript
function Yio({selectedTaskId:t,selectedTaskIsBusy:e,workspaceActiveRunTaskId:n,workspaceActiveRunTaskIsBusy:i}){return n!==void 0&&i&&!e?n:t}
```

Yio is 141 bytes, SHA-256 `a12d2093e2896d7e8ff8c84b5aa163925c869728b9e5e3365eef685d8b7016f5`. It projects a busy workspace task without replacing idle selection intent. OpenConductor already implements that projection and this change leaves it intact.

In the complete retained nro, hooks UTF-8 `[7172036,7172821)`, 785 bytes, SHA-256 `a8d21231a968ffc3193d8fc40bfcb8f40336a3fe5837992d4e78db81ecdabaac`, read tX.useWorkspaceTaskIds and tX.useWorkspaceActiveTaskId, derive selection through V9i, then derive the displayed task through Yio. The complete start/stop callbacks at `[7183537,7184843)`, 1,306 bytes, SHA-256 `2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4`, record the actual clicked task through tX.recordRun.

These are static source findings. Earlier REA graph/range and literal-retention limitations remain recorded in [the scripts investigation](../run-scripts/NOTES.md). No new REA tool failure was encountered. Static chains do not prove native timing, installed-Mac acceptance, persistent-history parity or visual appearance.

## Current-source mismatch

The existing API already returns `{ runs, history }`; the Rust runner already records most-recent-first workspace history. ScriptsPanel discards history during refresh and resets its explicit pick on workspace changes. A completed nondefault Test task therefore falls back to Dev on mount or return to the workspace.

Model the Domain keeps history and authoritative run statuses in one workspace-keyed snapshot instead of mutating explicit selection on each refresh. The correction derives the first still-configured visible task from history, below an explicit user pick and before the existing selection fallback. Busy projection remains a separate step. #956's sequence/workspace freshness guard must remain before snapshot publication. No automatic start is added.

## Regression checkpoint

Regression-only remote head `f7a813c680bb979bb8180d3cf6512938f81f3c69` adds six tests to the actual mounted ScriptsPanel and RunSplitButton. The fixture loads production selection, output and command handlers; it substitutes only Tauri IPC/events, portals, drawing and unrelated settings/keybinding boundaries.

The cases cover nondefault historical Test on mount, A to B to A, missing historical IDs, all-deleted fallback with real command identity, busy Dev over idle Test history, and empty-history fallback without automatic starts. Prove It Works requires the hosted before/after behavior, not a source-string assertion.

The initial new test blob is `038592b684aadb658f6979af9e5be32b712d190a`. Hosted typecheck also caught TS2339 in the all-deleted fixture: asserting `commands` deeply equal to `[]` narrowed it to `never[]` across the later awaited click. The correction asserts its zero length instead; it preserves the same no-command behavior and the subsequent exact command ID assertion. All six regression behaviors remain intact. Existing Setup and completion regressions are unchanged:
- setupContext.test.ts SHA-256 `49f9e52bd5fbcbd3888e26ecbeb259fe1c6d4c5914547648c0b716e650b1a74d`.
- runCompletion.test.ts SHA-256 `3fb1b9bad41e2e2ece03b844a6c6b5410d1a939c12cd3fbedb00c7f8bb0b3234`.

Hosted RED is confirmed at regression-only head `f7a813c680bb979bb8180d3cf6512938f81f3c69`, CI run [42933875902, frontend unit job130238992850](https://github.com/reason-machines/openconductor/actions/runs/42933875902/job/130238992850), using `node --test "src/**/*.test.ts"`. Exactly three of the new cases failed: nondefault history was ignored on mount, A displayed Dev output instead of Test, and deleted-ID filtering did not select the surviving Test. The other three cases passed. The full suite reported 2,127 passed and three failed out of 2,130. The fixture TS2339 above separately prevented typecheck/build and downstream app jobs; no retry was requested.

```text
not ok 1573 - actual Run panel restores a workspace's nondefault history without starting a task
error: 'Test history outranks the configured Dev default'
not ok 1574 - actual Run panel restores each workspace history through A to B to A
+ 'history-a:dev transcript\\n'
- 'history-a:test transcript\\n'
not ok 1575 - actual Run panel skips deleted history IDs before selecting a configured task
```

Hosted GREEN for the production correction is pending. Local tests, typecheck/build, dependency installation and runtime capture were not run. The only executable checks here are inert-source length/hash comparisons and `git diff --check`. No screenshot is available because local browser/app/native capture is outside the admitted lane.

## Recheck the retained text without executing it

Run this Python from the repository root. It hashes received literals and the already-retained nro; it does not execute reference JavaScript or reacquire any asset.

```python
from pathlib import Path
import hashlib
import re

readme = Path("evidence/run-selection-history/README.md").read_text()
blocks = re.findall(r"```javascript\n(.*?)\n```", readme, re.S)
expected = [
    (1290, "5863dcf6bffa630223a97be94ae9afa6d72ac032859fbdc60599b6e7f6073bc2"),
    (233, "fd7211bef2eb6b8b2aa76265acc10b80503b0deb1e8dad8e0c51fc60b0058570"),
    (141, "a12d2093e2896d7e8ff8c84b5aa163925c869728b9e5e3365eef685d8b7016f5"),
]
for source, (size, digest) in zip(blocks, expected, strict=True):
    data = source.encode()
    assert len(data) == size
    assert hashlib.sha256(data).hexdigest() == digest
nro = Path("evidence/terminal/strip-toolbar/reference-nro.txt").read_bytes()
assert len(nro) == 29165
assert hashlib.sha256(nro).hexdigest() == "906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123"
for start, end, digest in [
    (7172036, 7172821, "a8d21231a968ffc3193d8fc40bfcb8f40336a3fe5837992d4e78db81ecdabaac"),
    (7183537, 7184843, "2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4"),
]:
    data = nro[start - 7170202:end - 7170202]
    assert len(data) == end - start
    assert hashlib.sha256(data).hexdigest() == digest
print("PASS: three received literals, complete nro and both consumer ranges")
```
