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

No browser or native launch was performed. This correction does not establish a cause for the earlier unexposed native window, prove protected-directory preservation, or qualify a compiled package. Native/installed UI, onboarding Continue to Home, signature, and compiled executable identity remain unverified here. E1 owns native execution; 992 owns the consuming-main package.
