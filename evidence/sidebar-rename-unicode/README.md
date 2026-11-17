# Workspace rename: Unicode mark qualification

Conductor Rebuild reserves only the Rust directory-name validator and this new witness. The workspace-per-chat persistence owner confirmed no overlap; the central ledger accepted that separation. No dialog, store, database, symlink, branch-rename, native queue or existing fixture changes belong to this increment.

## Evidence

The complete retained Conductor 0.87.6 renderer and shared-index digests, 19 exact helper/caller bodies, 11 fresh-main source pins and four import/export bindings were rechecked against main `524c598b34157483e669167ed1f9032cc02fff18`. See `source.json` and `reference/`. The retained REA parent evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`; the shared-index digest is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The reference `QQe` normalizes NFC and retains Letter, Number and Mark. Its `XQe` validator uses the complete retained `YQe` expression for those same categories. The current frontend preserves that rule, but the Rust IPC validator uses only `char::is_alphanumeric`, `_` and `-` and explicitly documents its refusal of combining marks. This is a source-level candidate, not yet an executed product defect.

## Regression-first witness

The new frontend test executes the exact retained pure `QQe`/`XQe`/`YQe` bodies in an isolated VM context and compares them with the actual frontend normalization, validation and rename plan. It covers three NFC-stable names: `q` followed by U+0301 (nonspacing mark), U+20DD (enclosing mark) and U+093E (spacing mark), plus ordinary normalization and invalid-character controls.

The new Rust tests call the actual `valid_directory_name` used by `db_rename_workspace`, using the identical three names and additional invalid controls. Existing ordinary/empty/path/space tests remain unchanged. Acceptance/rejection must be observed on automatic hosted CI before any validator implementation is changed; expected failure counts are not results.

Hosted commands once published:

```bash
node --test src/state/workspaceRenameUnicode.test.ts
cd src-tauri && cargo test --locked sidebar_rename_commands::tests
```

The existing automatic frontend and Tauri CI jobs already discover these tests; no workflow change or manual dispatch is needed.

## Verification and limits

- Passed on Reason cloud: exact retained-source hashes, fresh-main source pins, Python preparation/compilation, `git apply --check` for the Rust test-only patch, and `git diff --check`.
- JavaScript and Rust witness execution: **not run yet**.
- Product implementation: **unchanged**.
- Original and clone native rename, filesystem/database/branch effects, installed-package behavior and visual parity: **not run**. No screenshot is claimed.
- No new REA acquisition or engine invocation; retained exact source bytes, not new runtime observations, establish the reference contract. The previously recorded REA semantic heap-exhaustion limitation is unchanged.

Keep this increment separate from Home IME PR #1071. That PR first consumes the merged banner repair through its existing automatic CI subscription. After #1071 merges, reuse this Session's assigned branch from fresh main, requalify source pins, publish these tests in a new ready main-based PR, observe hosted RED, then make only the qualified validator correction. No stacked PR, duplicate builder, native executor, local Node/Rust runtime, manual dispatch or new watcher.
