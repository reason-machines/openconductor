# Link workspaces boundary-key selection

Conductor Rebuild checked default main `bce99cb5023d22bdc2fa6eac203b74cb915b6208`.
`LinkedDirectoryPicker` ignores Home and End. Enter therefore activates the old
selection: with Browse, workspace A, and workspace B, End from A does not select B.
Existing directory rows can make Enter unlink a directory instead of choosing B.

## Reference declaration

The retained Conductor 0.87.6 renderer was rehashed in full. Eight exact UTF-8
byte spans, their identities, the original attachment identity, and REA lineage
are in [source.json](source.json). No reference JavaScript was executed. The
original semantic renderer analysis exhausted its heap; this check reads the
identity-verified shipped bytes as inert data.

`Auo` provides controlled selection to `qZ`, renders Browse and linked-directory
rows before workspace rows, and binds each workspace toggle to that workspace's
`localId`. `qZ` delegates through `Y5s` and `KV` to `P6/Xyi`. `Y5s` sets `loop:!0`,
so ordinary arrow wrapping is not a gap. `Xyi` prevents default for Home and End,
selects the first or last available item, and dispatches Enter to the selected
item. `$o/M5s` and `Euo` connect selection to the workspace callback.

The correction adds only the two boundary-key branches to the existing keyboard
handler. The selection model and Enter dispatch remain unchanged. No new helper,
provider operation, shared popup change, or backend edit is needed.

## Executable evidence

The builtin-only Node witness executes the production `keyDown` body and checks
that `Dialog.Popup` is wired to it. Only state updates and the `choose` callback
are substituted. It verifies selection targets, not real filesystem mutations.
The fixture was frozen before the three-line production correction. Captured
logs have only trailing whitespace removed.

- [RED](red.log): five missing Home/End assertions fail and five controls pass.
- [GREEN](green.log): the same ten cases pass; fixture SHA-256 is unchanged.
- [Nearby GREEN](nearby-green.log): all seventeen keyboard and existing directory
  tests pass after restoring dependencies with `npm ci --ignore-scripts`.
- [Earlier nearby run](nearby-missing-dependency.log): could not import
  `@tauri-apps/api` before dependencies were restored. This is not product RED.

Commands run on Reason Cloud:

```bash
node --experimental-strip-types --test src/features/chat/linkedDirectoryPickerKeyboard.test.ts
node --experimental-strip-types --test src/features/chat/linkedDirectoryPickerKeyboard.test.ts src/features/chat/linkedDirectories.test.ts
sha256sum -c evidence/dialogs/linked-picker-boundary-keys/fixture.sha256
python3 evidence/dialogs/linked-picker-boundary-keys/verify_source.py --assets artifacts/dialogs-icons-source-6013
git diff --check
```

The first local build was interrupted after branding validation. A fresh
`npm run build` passed branding and TypeScript, then timed out after 300 seconds
while Vite was transforming modules ([partial log](local-build-partial.log)).
Full build and exact-head hosted checks are pending. Browser, native,
installed-build, visual, and real link/unlink acceptance are NOT_RUN. No screenshot
exists yet: serialized browser admission was requested, and no preview or native
runtime has been started for this unit.
