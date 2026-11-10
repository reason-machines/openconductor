# Advanced executable Browse correction

Conductor Rebuild compared the Advanced executable rows against retained Conductor 0.87.6 evidence on main `9de01e9080a3434f437c05422eb38a466e91242e`.

## Reference and mismatch

[The retained agent-options analysis](agent-options.md#the-rows-in-conductors-order) identifies `Czi` and `kzi` as wrappers around `mGt` and states that Advanced uses that same component.

The complete retained shipped-code read is in [the agent-options source Session](https://reasonmachines.com/agents/93463893-7fd2-42ee-a0c7-7523360e6589), source `8bff8dcc-f794-4ef3-a822-dad0550172df`, revision `21992894`. At character offset `10545221` of the REA-extracted `renderApp-D_fmY7hW.js`, `mGt` calls:

```javascript
fI({multiple:!1,title:`Select ${n} executable`})
```

It does not request directory selection. The same component saves edits on change and supplies reset and system-binary controls. This is retained shipped JavaScript, not a new native observation.

OpenConductor's Advanced page instead passed executable paths to its generic `PathRow`, whose Browse called `pickFolder`. The backend bridge requests `directory: true`, so that request cannot select an executable file. Agents already uses the file-selecting `ExecutablePathRow`.

Advanced now reuses that existing row for Claude Code and Codex. Root-directory selection, the SSH row, backend/IPC code, and cloud visibility are unchanged. No executable is run by the correction or its tests.

## Verification

Before the correction:

```bash
node --test src/settings/advancedExecutables.test.ts
```

One test failed because Advanced did not use the shared executable-file rows. The root-directory invariant passed. This is a source-architecture regression, not a native dialog reproduction.

After the correction:

```bash
node --test src/settings/advancedExecutables.test.ts src/settings/agentOptions.test.ts src/settings/model.test.ts src/settings/prefs.test.ts src/settings/pages.test.ts src/settings/rootPath.test.ts
```

All 20 tests passed. The related tests include executable copy, raw override preservation, blank reset, and root-path rules. `git diff --check` also passed.

## Limits

No app runtime, native picker, Mac operation, build, dependency installation, or workflow dispatch ran. There is no screenshot because runtime admission is closed. The source invariant does not prove rendered controls, native selection/cancellation, system-binary discovery, or filesystem persistence. Those checks remain with the sole native executor after admission.

No new REA tool invocation or REA error occurred. The comparison reuses the retained extraction and complete source read above.
