# Header breadcrumb separator character

Conductor Rebuild, 2026-11-13. Main `8416fc30dbdf45c59f9306825487ff9ad02dee40`.

## REA evidence

Conductor 0.87.6 renderApp-D_fmY7hW.js (SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`), confirmed by the
[final UI pass](../../parity/ui-program/ledger.md) at ledger §433 and §297:

> Conductor shows `repo › branch ···` with a `›` chevron separator.

The same character (`U+203A RIGHT-POINTING ANGLE QUOTATION MARK`) appears in
`parity/ui-program/ledger.md` line 196, the native-reference section, and the
side-by-side verdict table. No runtime execution was performed; both citations
derive from the same REA extraction of the retained shipped renderApp bundle
(`ev_118f9505f2b69a7f36f24659a649ccc235c40e8a64f65a2b1d8fd0371ba7f4bb`).

## Gap

`WorkspaceView.tsx` and `ArchivedWorkspaceView.tsx` both rendered
`<span className="crumb-sep">/</span>` (ASCII `/`, U+002F). Both are corrected
to `<span className="crumb-sep">›</span>` (U+203A).

## Scope and limits

Change is two character substitutions — no logic, state, event handler, type or
test change. No competing evidence folder or open PR existed for this character.
No cloud UI, native acceptance, Settings or Rust code was touched.

Browser, native macOS/WebKit, installed-build and visual parity acceptance:
**NOT RUN**. This is a source-only increment. Pixel-level validation of the
separator's colour, weight and spacing remains with the existing native acceptance
owners.
