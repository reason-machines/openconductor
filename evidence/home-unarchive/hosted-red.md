# Home Unarchive hosted regression receipt

Conductor Rebuild, 2026-11-10. Observed through the supported PR check log, not a local rerun.

- PR [#891](https://github.com/reason-machines/openconductor/pull/891), regression-only published head `4d799fa4456369779ba34641be76987d536e6781`.
- [Keybindings run 42789592295, job 129739316030](https://github.com/reason-machines/openconductor/actions/runs/42789592295/job/129739316030), completed 09:23:06Z with failure.
- Existing build and unit-test steps passed. `npm run test:e2e` failed.
- Production Home component and CSS were unchanged at this checkpoint.

## Decisive output

```text
ok 151 - archived workspaces are listed in the palette, open read-only and can be unarchived
ok 152 - Home's All workspaces lists archived workspaces under Only archived and Showing all
not ok 153 - Home Unarchive restores through the store with click without opening the workspace
not ok 154 - Home Unarchive restores through the store with Enter without opening the workspace
    not ok 1 - click dispatches once, suppresses row navigation and settles only matching terminal events
    not ok 2 - Enter dispatches once, suppresses row navigation and settles only matching terminal events
    not ok 3 - a synchronous activation burst dispatches once
    ok 4 - the archived row remains independently openable outside the control
not ok 155 - Home Unarchive controlled pending and event lifecycle
# tests 193
# pass 186
# fail 6
# cancelled 0
# skipped 1
```

Every direct new failure reported `locator.waitFor: Timeout 1500ms exceeded` while waiting for the archived row's button named `Unarchive workspace`. There are five direct failures plus their failed parent group, not six independent product defects. The archived rows were rendered first. The independent row-opening control passed.

The fix must preserve `tests/e2e/sidebar-archived-view.e2e.mjs` and `tools/home-unarchive/` exactly from this checkpoint. Passing after the fix remains unobserved here. This is browser/demo and controlled-event evidence, not native worktree, setup-script, persistence, screenshot or side-by-side acceptance.
