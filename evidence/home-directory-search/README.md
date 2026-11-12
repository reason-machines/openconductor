# Directory search after workspace rename

Conductor Rebuild preserves Home search by a workspace's directory after the user gives that workspace a different display name.

## Source boundary

Checked main `9c276e2e86c0bd7ed97c8ccd0467f30c7a8ebcab`, containing #1178. The five caller and consumer files in `post1178-requalification.json` match the earlier source packet byte for byte.

The retained Conductor 0.87.6 renderer has SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its REA evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Exact `AJo`, `pFi`, and `UJo` search-field excerpts and UTF-16 offsets are retained in `source.json`. This is static shipped-code evidence, not a new observation of Conductor running.

Conductor's `UJo` passes `hi.directoryName` as the directory search field. OpenConductor's `workspaceFromRow` retains both the stored directory and custom display name. `archivedFromRows` preserves that workspace, but `homeRows` passes `workspace.name` as the directory. For a stored directory `dirneedle` and display name `Named`, the directory is therefore absent from the search input. The fix changes only that field to `workspace.directoryName ?? workspace.name`; legacy workspaces keep their current fallback.

## Frozen regression

`src/home/allWorkspacesDirectorySearch.test.ts` is the unchanged eight-case fixture prepared before #1178 merged. SHA256 is `eeabf181e31d90c4be5fd1f78bea489439e96841731807de0422ff5ab138ed69`.

The first four cases cover renamed archived and active workspaces, case-insensitive matching, and words matched across directory and repository fields. Four controls preserve custom display names and branch search, unmatched-word rejection, archive/project filtering, and legacy workspaces. The tests exercise the real pure mapper and search functions without a mocked transport or new dependency.

Prepared focused command:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/home/allWorkspacesDirectorySearch.test.ts
```

The regression was published before the production fix. [Hosted baseline job 131276024170](https://github.com/reason-machines/openconductor/actions/runs/43245241038/job/131276024170) on head `222830deb42f450eb9be283f27983ea8d3a025a6` reproduced exactly four assertion failures and four passing controls. The full Node suite had 3,787 passes and only those four failures. Typecheck and color lint passed; the build was not reached after the intended failure. [The focused excerpt](hosted-red.txt) and [receipt](hosted-red.json) retain the result.

The one-line candidate retains the identical fixture. Its hosted GREEN is pending. Standard enabled frontend CI runs `node --test "src/**/*.test.ts"`, along with typecheck, color lint, and build. No custom workflow or dispatch is added.

## Verification and limits

Passed on Reason Cloud: 11 static qualification checks, the unchanged fixture hash, and `git diff --check`. Re-read the fetched main `9c276e2e86c0bd7ed97c8ccd0467f30c7a8ebcab` before the patch; all five caller/consumer files and retained renderer excerpts still match their source pins. No Node tests, install, typecheck, build, server, browser, native app, or package ran locally. Hosted candidate behavioral results are pending.

No screenshot is attached because no interactive slot has been granted. Rendered search behavior and containing-package/native acceptance remain unverified. Existing ACC serialization and release/E1 ownership remain in place. This is the existing Home directory-search scope, not a new owner or queue row. Original Prefix9 and Title4 fixtures and the #1178 implementation are unchanged. No ledger file, persistence mapper, header, or other owner's file is edited.
