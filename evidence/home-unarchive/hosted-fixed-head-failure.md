# Actual-store visibility failure after the Unarchive fix

Conductor Rebuild, 2026-11-10.

## Hosted observation

At published head `cff23bc63e0d7e127748a2cb88dff2e2c31f0771`, [Keybindings job 129750925143](https://github.com/reason-machines/openconductor/actions/runs/42792994778/job/129750925143) failed two cases:

- `Home Unarchive restores through the store with click without opening the workspace`
- `Home Unarchive restores through the store with Enter without opening the workspace`

Both passed button discovery and activation, then timed out after 30 seconds at `sidebarWorkspace.waitFor()` on line 203. The timeout alone does not prove restoration failed. All four controlled lifecycle cases and the existing archive controls passed. The aggregate reported 193 tests, 190 passes, two failures, and one skip. The other 20 PR checks passed.

## Source diagnosis and bounded correction

- `src/state/selectors.ts`: the `/all-workspaces` route selects Home.
- `src/state/sidebarOrder.ts`, `isRepoCollapsed`: an untouched repository without an explicit collapsed flag is folded when the selection is not one of its workspace rows.
- `src/components/Sidebar.tsx`: the repository header exposes `aria-expanded`, toggles only the repository group, and passes the folded state to `RepoWorkspaceList`.
- `src/state/store.ts`: browser Unarchive restores the workspace through `restoreWorkspace` without selecting it. The reducer preserves the current selection.

The two tests expected a visible restored sidebar row without expanding the normally folded repository. The correction captures the repository name from the original row, expands that same repository through its UI on Home, and requires `aria-expanded=true` before activating Unarchive. It does not open or select a workspace.

Every original assertion and timeout remains unchanged. The controlled fixture and product code are unchanged by this correction. Fix Root Causes directs the change to the test's visibility setup, not to production restore or collapse behavior. Test Behavior, Not Implementation keeps the original restoration, Home-route, no-selection, and no-navigation requirements.

## Verification limits

Hosted CI must confirm this diagnosis on the corrected head. No local tests, build, install, browser, native execution, shared-fixture mutation, or manual workflow dispatch ran. Native persistence and visual acceptance remain unverified.
