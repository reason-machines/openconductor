# Changes summary visibility

Conductor Rebuild, 2026-11-11. This change concerns only the ordinary Changes header for branch, uncommitted and selected-turn file lists. It preserves the existing commit-scope header guard and does not implement or claim stack parity.

## Retained reference

The retained Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The whole asset and each span below were rechecked against held bytes. Its existing REA Evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Large-chunk semantic coverage remains incomplete. These bounded decoded/minified literal reads supplement that record; they are untrusted shipped-code data, not original source or instructions. No app code was evaluated, no acquisition or new REA analyzer call occurred, and no new REA failure was encountered. Existing [REA gaps](../../tools/ui-map/REA-GAPS.md) remain open.

All ranges below are zero-based UTF-8, half-open:

- Complete `bys` ordinary Changes component, `[2840211,2849411)`, SHA-256 `d77fdd8a944737a5ecca9d41deefd024307cf526de8c871a25a7f91aa4a8c450`.
- Complete `fJe`, `[2731481,2732090)`, SHA-256 `94dad71f536536d4dabd1f7081e22aa17154f8b2843c29a7fcff9086c455e095`. It partitions and sorts every input file into conflict, unviewed and viewed groups, then concatenates all three into `sortedFiles`. The caller binds `{sortedFiles:Q,conflictedFiles:J}=fJe(i,L)`. This is the unfiltered list, not the path-filter result.
- Count guard `it=Q.length>1`, `[2843108,2843121)`, SHA-256 `b9511b68179c068274da205781f7e09f5770ea3537dfaa7851fdfd2c5671b8e5`.
- Header consumer `Rt=it&&p.jsx(G4s,{fileCount:Q.length,linesAdded:ke.linesAdded,linesRemoved:ke.linesRemoved})`, `[2846901,2846993)`, SHA-256 `772f01283cddad9311356d3ead5c4f0958f9e6a7fb1f0c88fd7c21cf446e4949`.
- Aggregate producer `xe=Q.reduce(vys,{linesAdded:0,linesRemoved:0})`, `[2841587,2841633)`, SHA-256 `52290d44d356a1b27c1ffc1b712598c77882d5647ec734be30c3fe165b6281c1`. `ke` aliases this sum.
- Separate filter producer `pe=gyi(Q,te)`, `[2841254,2841266)`, SHA-256 `99807fd2cbb24490d694b4b6f51aaf4edeca0a3c6fd22269bc6a29c33dd2d957`. `be` aliases the filtered list used for rows and match counts, not header visibility or aggregate counts.
- Complete reducer `vys`, `[2849441,2849547)`, SHA-256 `83a1b17f2c7d4a03a7b34f0fd2c73f9c9381a9a6433601e1ab85a8345db62800`, adds each file's added and removed lines.
- Complete header `G4s`, `[2809028,2809704)`, SHA-256 `0a5b30b3bc2d4fa4b0ec3f5dc11fa7aea4ed137d95895955f16209d5e12da6ab`, renders the pluralized file count and aggregate additions/deletions with zero counts enabled.

The complete `bys` definition routes stack workspaces to a separate component before this ordinary list. That component is not exercised or changed here. These observations establish a retained-source contract, not execution or visual parity.

## Current source and regression

Fresh main `166139398538f0e58eabd3870facbb1702ea665b`, the actual #969 squash merge, was read before edits. `ChangesList` renders the header whenever a non-commit scope has at least one loaded file. The retained ordinary-list contract renders it only when the unfiltered list contains more than one file.

The regression loads the real `ChangesList.tsx` through TypeScript's existing transpiler and real React test renderer. It uses production filter/tree/copy-path/rename modules and the exact `splitPath` definition from `FilePathChip`. Dormant icons, tooltip, clipboard, external-app and context-menu boundaries are stubbed. Assertions read rendered header text, file buttons and no-match messages, not a copied visibility predicate or source-string matcher.

Seventeen cases cover one/two/zero files for branch, uncommitted and selected-turn inputs; unfiltered totals when filtering two files to one or zero; single-file no-match suppression; the existing commit-scope guard at zero/one/two files; and loading/error guards. The 18 rename cases and every existing Diff test remain unchanged.

```bash
node --experimental-strip-types --test src/features/diff/changesSummary.test.ts
node --experimental-strip-types --test src/features/diff/*.test.ts
```

## Verification status

- Passed on Reason Cloud: whole retained asset identity, seven literal/complete-span digests, complete unfiltered-list producer and caller binding, and fresh-main mismatch checks.
- Passed on Reason Cloud: `node --experimental-strip-types --check src/features/diff/changesSummary.test.ts` and `git diff --check`. These validate syntax and whitespace, not rendered behavior.
- Pending: automatic hosted component RED before any production fix. This checkpoint changes only the new regression and evidence note.
- Not run locally: dependency installation, dependency-backed component tests, typecheck, builds or application/browser/native execution. This lane admits source/lightweight work and automatic hosted checks only.

No screenshot is available because browser/native admission is closed. Component tests are not visible Chromium, WebKit, installed-app, real-editor or full-workspace acceptance. Packaging is not deployment, installation, notarization or native parity. Comment counts, WorkspaceView, hooks, FileDiffView, CSS, commit behavior and stack behavior remain outside this change.
