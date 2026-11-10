# Sidebar navigation shortcut overrides

## Scope

Home, Create, and Search used registry defaults instead of current keybinding overrides. Home's title also used its default key. The correction reads `useKeybindingOverrides()` and uses the existing `effectiveShortcuts` resolver for the three hints and Home's primary-key title. Additional saved replacements appear in the hints. Reset returns to registry defaults.

Only Home has a title in the retained reference caller. Create and Search have shortcut hints but no corresponding title. Footer shortcuts, header actions, unbinding, AllWorkspaces, home.css, #849, and Unarchive are outside this change.

## Regression checkpoint

`src/components/sidebarShortcutHints.test.ts` contains seven tests. They evaluate the actual production hint function and navigation attribute expressions using the real registry, override parser, resolver, glyph formatter, and title formatter. Coverage includes default hints, primary and additional saved replacements for all three rows, changed snapshots, reset, Home's primary-key title, and the live-provider source wiring.

The regression-only checkpoint `49c8ff2003378164ec0f9551a934a78fe5ba551a` left production Sidebar unchanged. Ordinary CI ran the same seven tests through:

```bash
node --test "src/**/*.test.ts"
```

Hosted RED is confirmed by [CI run 42776616979, unit job 129696492459](https://github.com/reason-machines/openconductor/actions/runs/42776616979/job/129696492459). The default case passed. The other six cases failed with assertions: Home/Create/Search kept default hints instead of both saved replacements, the changed/reset case stopped at its first remap assertion, Home's title kept its default, and the live-provider import was absent. Overall: 1,620 passed, six failed, none skipped or cancelled. [Retained failure output](hosted-red.txt) includes the exact diagnostics.

The second failing job, `Frontend typecheck + build` (129696492259), passed `npm run typecheck` and failed its subsequent unit-test step with the same six failures. Its build step was skipped. This was not a TypeScript diagnostic or an import/infrastructure failure.

The source correction keeps every assertion unchanged. Hosted GREEN is pending. No local test, build, installation, browser, or native runtime was used for this correction.

## Current-source reconciliation

The supported current-main snapshot was `8c085c53590c7ca5d2f49c95bab3882a82382233`. At that commit, `Sidebar.tsx`, `KeybindingsProvider.tsx`, `overrides.ts`, and `tooltipPlacement.ts` were byte-identical to the regression baseline. The gap therefore still existed: navigation used the default-only `hint` function with no live snapshot, while the provider and effective resolver already supported saved replacements.

Only the three navigation expressions, Home's title expression, the provider subscription, and NavRow's support for multiple hint strings change. The default-only `hint` function and its header/footer callers are unchanged. Focus actions, section behavior, unbinding, #847, #849, and Unarchive remain outside this correction.

## Reference provenance

The integration coordinator supplied the completed AIA-SEEK-02 caller receipt from the existing reference owner. The recovered Aia UTF-8 range is `[10028773,10034469)`, SHA-256 `6faf8a9901820921bcff5b8f09e699d710e1ca3df2768f6de11f73a2e066e0be`, inside retained slice `[9983071,10063071)`, SHA-256 `f2b439df4ccc37f361ba14db094aadc730319bcb1bdf18b5f4de8beef30fcfd5`.

The supplied caller receipt identifies Home's `HH("Home", "nav.home")` title and `Ss` hint, Create's `Ss` with `workspace.create`, and Search's `Ss` with `toggleCommandPalette`. It does not establish footer behavior, Create/Search titles, or unbinding behavior. Whole-asset provenance remains prior evidence rather than a fresh full-asset read.

Existing committed resolver/import/storage evidence is retained in:

- `evidence/help/shortcut-overrides/reference-provenance.md`
- `evidence/help/shortcut-overrides/reference-focused.json`
- `evidence/help/shortcut-overrides/reference-transitive.json`
- `evidence/help/shortcut-overrides/reference-trace.txt`
- `evidence/home-routing/reference-static.json`

No reference extraction or application runtime was repeated for this checkpoint.

## Local execution limits

The first local preflight timed out before any Node invocation in that command. The second admitted invocation returned an ambiguous execution receipt without numeric guard readings, TAP output, or exit status. Its guard/start/result and termination remain unknown. The local RED allowance may have been spent. Neither a passing nor a failing behavioral result is credited, and the test was not replayed.

One permitted subsequent own-process inventory returned exit 0 with zero matching test processes and zero permission-denied reads. That is only a process snapshot, not proof of the original operation's settlement or historical outcome. The interruption report was accepted by the Reason team. See the adjacent interruption records.

## Verification gaps

These source-expression tests do not mount React. They do not prove provider subscription updates, actual keyboard dispatch, browser rendering, native behavior, or side-by-side visual parity. No screenshot or native acceptance evidence is available because this lane has no browser/native runtime admission.

Recorded by Conductor Rebuild.
