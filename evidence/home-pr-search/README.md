# Home search by pull request number

Conductor Rebuild, 2026-11-10. Source baseline `e1687ee85a989d91a40f48932267d08b1a513a7f`.

## Reference contract

The retained Conductor 0.87.6 frontend came from Sven's real app. [Extraction provenance](../frontend/README.md) and REA application evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` identify that artifact. This pass reread the retained asset as inert text and verified its full SHA-256 as `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. It did not run the extracted code or start a new REA analysis.

[Exact static excerpts](reference-static.json) record UTF-16 character offsets in `renderApp-D_fmY7hW.js`:

- `UJo` builds Home search fields with `prNumber: v.workspacePrNumber[hi.localId]` at offset 9,822,370.
- `AJo`, at offset 9,811,102, adds `#<prNumber>` to the text-search haystack when the number is known. Every query word must match somewhere in the combined fields.
- `pFi`, at offset 9,811,356, combines text matching with the separate workspace-number matching rule.

These are decoded shipped JavaScript observations, not original source or native execution. Existing REA semantic-analysis coverage limits remain unchanged. No new REA failure occurred.

## Reproduced defect and fix

OpenConductor's `matchWorkspace` already accepts a PR number and searches it. Its caller, `homeRows`, omitted the known `Workspace.pr.number`, so Home could not find a workspace by that PR number unless another text field happened to contain it.

The fix passes `row.workspace.pr?.number` into the existing matcher. It does not add a poller, change PR lookup, alter workspace numbering, or change the search algorithm. Unknown and null PRs remain absent.

## Verification on Reason cloud

The new regression exercises `homeRows`, not just its matcher, with distinct PR numbers and absent/null PRs. It covers `#4321`, `4321`, combined title/project terms, unmatched numbers, and the existing project filter.

Before the production change:

```bash
node --experimental-strip-types --test --test-name-pattern='Home search finds' src/home/allWorkspaces.test.ts
```

Failed as expected: query `#4321` returned `[]` instead of `['osaka']`. [Raw failing result](red.tap).

After the one-line change, the identical command passed 1/1. [Raw passing result](green.tap).

```bash
node --experimental-strip-types --test src/home/allWorkspaces.test.ts src/components/sidebarLabel.test.ts src/state/rowStatus.test.ts src/state/workspaceNumber.test.ts
```

Passed 31/31. [Focused results](focused.tap). `git diff --check` passed.

Browser/native acceptance, screenshots, application build, local typecheck, package installation and real PR lookup were NOT RUN. Local dependencies are not installed; exact-head CI must separately verify typecheck and build. Runtime admission remains with the existing owners. No Mac/native/browser operation, build, install, workflow dispatch or watcher was started by this pass. PR publication uses the repository's normal CI.

For the existing acceptance owner, the remaining observation is to use a workspace with an already-known PR, search Home for its `#<number>`, then combine that with a title or project term. Check both a positive match and a different PR number, without changing repositories or creating a PR. No rendered or final parity credit is claimed from these pure tests.
