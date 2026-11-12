# Empty Home startup reads

Conductor Rebuild checked default branch `7b99088f24c54ffca941fe6d5528260633328d0e`. The visual profile remains byte-identical to the earlier baseline `1c8e9593099bce8ebfbc19d83052cbfd47df5ad0` (SHA-256 `56b0edd413b58fb2591b2d279d77d2c9161c8d391f13f5852c1254ba2e8c28c7`).

`useAppStore` awaits `db_read_navigation_sections` during sidebar hydration. The restricted profile omitted that command, so a fresh empty Home entered startup error. Collapse loading also needs `local_storage_get_entry` and its managed `SubsystemStore`.

The product correction is three lines: register the two existing read commands and manage the real store under the already-checked private app-data directory before constructing the window. No normal-builder, hydration, window, provider, process or write-command change is included. `SubsystemStore::new` only records its root; the getter reads its index and encoded subsystem path.

## Frozen regression

```bash
node --experimental-strip-types --test src/state/visualQaStartup.test.ts
python3 evidence/qa/ordinary-visual-startup/verify_boundary.py
```

The regression loads the actual React store and storage client, supplies synthetic empty read results, and rejects commands absent from the real Rust handler list. This is not a native Tauri dispatcher or a real SQLite invocation.

- RED on fresh main: exactly 3 intended failures, 4 controls pass (`red-current.tap`). The original baseline is retained in `red.tap` and `baseline.json`.
- GREEN: all 7 pass (`green.tap`), with the fixture SHA-256 unchanged at `775f9da8b70cac58f5db04e39d33d7bf3b4e91a621f20b4c0865943dc528bff4`.
- Controls preserve surfaced read failures and reject provider/process/clone/storage-write commands.
- Static composition checker passes with exactly 15 handlers and private managed-state ordering.

## Compiler-only follow-up

Hosted check `131078520794` at published head `19e66cb0126bc266844ea4a4217ed12a1a9821e2` failed with TS18046: `useAppStore` remained `unknown` inside the nested harness. Keep the actual export check and capture its narrowed value in `useCheckedAppStore`; no cast, assertion removal or product change is added.

The revised fixture SHA-256 is `2f6e2fabec04e7e848d27c6ef98b00b1ca9b01e94061c39b8a221c7542f2bded` (`fixture-v2.sha256`). With only the three product additions temporarily removed, the same revised fixture fails the same three intended cases and passes four controls (`red-v2.tap`). Restoring those additions passes all seven (`green-v2.tap`), with that hash unchanged.

`npm run typecheck` now passes locally (`typecheck.txt`). The portable Rust command from the parent README passes all nine tests (`portable-rust.tap`); it does not compile the macOS-gated Tauri adapter. Static composition and `git diff --check` pass. The three underlying getter/store files are byte-identical to the checked main; their hashes and source locations are retained in `read-routes.json`.

No browser or native launch was performed. This correction does not establish a cause for the earlier unexposed native window, prove protected-directory preservation, or qualify a compiled package. Native/installed UI, onboarding Continue to Home, signature, and compiled executable identity remain unverified here. E1 owns native execution; 992 owns the consuming-main package.
