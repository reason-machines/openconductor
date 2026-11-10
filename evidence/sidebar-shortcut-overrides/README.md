# Sidebar navigation shortcut overrides

## Scope

Home, Create, and Search currently render registry defaults instead of the current keybinding overrides. Home's title also uses its default key. The intended fix uses the existing live provider snapshot and `effectiveShortcuts` resolver, including additional saved replacements and reset to defaults.

Only Home has a title in the retained reference caller. Create and Search have shortcut hints but no corresponding title. Footer shortcuts, header actions, unbinding, AllWorkspaces, home.css, #849, and Unarchive are outside this change.

## Regression checkpoint

`src/components/sidebarShortcutHints.test.ts` contains seven tests. They evaluate the actual production hint function and navigation attribute expressions using the real registry, override parser, resolver, glyph formatter, and title formatter. Coverage includes default hints, primary and additional saved replacements for all three rows, changed snapshots, reset, Home's primary-key title, and the live-provider source wiring.

The production Sidebar is unchanged at this checkpoint. Ordinary CI runs the test through:

```bash
node --test "src/**/*.test.ts"
```

Hosted RED and GREEN results are not yet available at this checkpoint. A RED result must identify assertion failures caused by the unchanged defaults or missing live-provider wiring, not an infrastructure or import failure. The same assertions must pass after the minimal product fix.

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
