# Sidebar Home native-title regression

Conductor Rebuild re-read fetched main `bac62cf4416902cbdbfbe5e521d0b73480a5e017` on Reason Cloud. This packet corrects only Sidebar's Home NavRow. It does not re-open the previously fixed HomeScreen or AllWorkspaces hidden-sidebar toggles.

## Retained real-app contract

The retained Conductor 0.87.6 renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; parent REA extraction evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

- [`home-routing/reference-static.json`](../home-routing/reference-static.json) retains both sides of the same sidebar caller: `O=HH("Home","nav.home")`, then the Home element's `title:O`. `Ss` separately supplies the in-row primary/additional shortcut hint.
- [`sidebar-shortcut-overrides/README.md`](../sidebar-shortcut-overrides/README.md#reference-provenance) pins the completed `Aia` caller to UTF-8 bytes `[10028773,10034469)`, SHA-256 `6faf8a9901820921bcff5b8f09e699d710e1ca3df2768f6de11f73a2e066e0be`, inside retained slice `[9983071,10063071)`, SHA-256 `f2b439df4ccc37f361ba14db094aadc730319bcb1bdf18b5f4de8beef30fcfd5`.
- The older `offset` fields in `home-routing/reference-static.json` are retained as-is, not relabelled as UTF-8. The newer qualified caller byte ranges above supply the byte identity.

These are retained REA-derived source receipts, not a new extraction, a rehashed complete renderer, or an observation of currently installed Conductor. No reference JavaScript was evaluated. No new REA call was attempted; existing partial-graph/acquisition limitations remain in the linked records.

## Regression and correction

[#1371](https://github.com/reason-machines/openconductor/pull/1371), merged as `37b5ca7824cf79da71ae20cd5296b4a01d609243`, removed Home's native title and changed the regression assertions to require an app Tooltip instead. Its reference citation describes a different screen's hidden-sidebar toggle, not this sidebar NavRow.

Restore the native title using the existing `titleWithShortcut` formatter and the effective primary `nav.home` binding. Keep all effective primary/additional in-row hints and their live override subscription. Create/Search retain no titles or app-tooltip props. `NavRow` forwards the optional title directly to its existing button; its now-unused tooltip-prop wrapper is removed. The shared Tooltip and the Sidebar top toggle/back/forward wrappers are untouched.

The existing seven-case `sidebarShortcutHints.test.ts` again checks Home's actual title expression under default, remapped, changed and reset overrides. It additionally checks that NavRow forwards the title to its button. These are source-expression tests, not mounted UI acceptance.

## Checks actually executed

The same inert verifier ran against the frozen current-main source and then the candidate:

```bash
python3 evidence/sidebar-home-native-title/verify.py .ara-state/home-sidebar-audit/current-main
python3 evidence/sidebar-home-native-title/verify.py
```

The first target was exported directly from fetched `origin/main` at the qualified SHA. This temporary directory is not part of the deliverable; a verifier can substitute a clean checkout of that SHA.

- **Static RED, exit 1:** two retained-reference checks passed; three product-source contract checks failed (missing Home title expression, missing title forwarding, and app-tooltip substitution).
- **Static GREEN, exit 0:** the identical five checks passed after the focused correction.
- **Whitespace:** `git diff --check` passed.

This is a static contract reproduction, not a behavioral RED/GREEN run. No local Node test, dependency installation, typecheck, build, browser, native app, provider turn, package or release was executed. Automatic PR CI is separate and its exact-head outcome must be recorded before merge. No screenshot is supplied because product/browser/native execution is outside this source-only assignment.

## Exact deferred native acceptance

Owner remains sole executor `e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46`; this packet makes no reservation, admission or dispatch. Existing isolation prerequisites must be cleared before any action.

On an admitted disposable profile and identified consuming OpenConductor build:

1. In the expanded sidebar, inspect and hover Home. Confirm its native title is `Home ⌘⇧H` with defaults and that no second application-tooltip popup competes. Record native hover evidence if capturable; a DOM title alone is source/DOM proof, not visible hover proof.
2. Save a primary `nav.home` remap plus an additional binding. Confirm the native title shows the effective primary only, the row hover hints show both, and each binding still opens Home. Change and reset the mapping without restarting; verify title/hints update together.
3. Confirm Create and Search still show their in-row hints without gaining a native title or app-tooltip wrapper. Do not treat top toggle/back/forward behavior as covered by this correction.

All three remain **NATIVE_NOT_RUN**. Installed identity, WebKit native-title timing/appearance and side-by-side final parity remain unverified. Source closure does not establish overall Home/sidebar parity.
