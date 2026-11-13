# Focus section menu failure diagnostics

Conductor Rebuild owns this test-only diagnostic under ledger lease
`SECTION-MENU-DIAG-15-01`. The checkpoint is based on main
`49fde8bf788f0914dc7e53e58c5b024a9294cc61`, resolved by both `git fetch origin main`
and the repository comparison API on 2026-11-10. That main contains the earlier
`2bfbf493196ef8e649e613676e5a0bff2fd57640` by 29 commits.

## Observed failure

[Keybindings run 42831165905, job 129881247571](https://github.com/reason-machines/openconductor/actions/runs/42831165905/job/129881247571)
ran PR #905 head `e0554c20089f76cbe291528b6db939aa7d40c893`.
The create-in-section browser test clicked `Focus actions`, immediately read
menu items with `allTextContents`, and failed its exact four-label assertion
with an empty array at `sidebar-sections.e2e.mjs:181`. The prior section
create/move/edit/delete test passed. The job retained only scroll diagnostics,
not a Focus menu event, DOM or accessibility trace.

The four labels are supplied unconditionally by `Sidebar.sectionMenu`.
The failing button follows `HeaderMenu` to `SidebarActionsMenu`, a controlled
Base UI 1.9.0 menu. The passing right-click path uses `HeaderContextMenu` and
the separate local `ContextMenu`. This excludes label filtering as an
explanation for the empty snapshot. It does not establish a mounting,
accessibility, event-order or timing cause. The CSS transition is not evidence
of one.

## Diagnostic scope

The existing browser test now installs a bounded 32-entry event and mutation
ring immediately before the original click. It records the trigger's expanded
state, menu presence, labels, ancestor accessibility attributes and active
focus. Before-click state is retained separately. On assertion failure, the
test logs the ring, final state and menu computed visibility, then rethrows
the original error. The listeners are removed after the original assertion.
No product code or application state is changed.

The original click, immediate query, four expected labels and assertion order
are retained. There is no wait, retry, changed motion preference, timing
budget, fixture adjustment or assertion relaxation. Instrumentation can affect
scheduling; a passing diagnostic run alone is not a causal fix or parity proof.

## Verification and limits

- `git diff --check` passed before publication.
- Manual source review confirmed that the immediate query and exact four-label
  assertion remain in their original order.
- Hosted automatic validation is pending publication. No workflow dispatch or
  manual rerun is requested. Actual results will be recorded separately.
- Local Node tests, builds, installs, analyzers and browser/native execution
  were not run under the source-only restriction. There is no new screenshot.
- This is not a product correction, deterministic causal RED, or GREEN claim.
  Any correction requires the captured mechanism and a separate exact lease.
- The updater contract remains evidence-blocked. #847 FULL STOP, the sole
  native executor and protected user data remain unchanged.
