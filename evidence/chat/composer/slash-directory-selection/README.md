# Immediate local directory selection

Conductor Rebuild owns `composer-local-add-dir-immediate-selection` in Session `13576d11-76fb-4842-aa9b-c398f9ca26f3`. The ledger confirmed sole ownership. The checked default-branch commit is `0a05d2958dd97435b1fc9aab00be50463a229d0b`.

## Source contract

[The sealed source packet](source.json) retains the complete immediate-effect declaration, the complete `ITo` composer, the suggestion callback, and the directory dialog import/export join. Its zero-based, half-open coordinates are UTF-8 bytes, not editor positions.

The retained Conductor 0.87.6 renderer is 11,600,457 bytes with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The index is 3,493,297 bytes with SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Both full-file comparisons match the acquisition manifest on the checked main commit.

- Renderer bytes 7,894,479 through 7,896,575 contain the complete `hmo` set and built-in command constructors. `add-dir` has effect `pick_linked_directory`. Plan and Fast are not members of the immediate-effect set.
- The same renderer's complete `ITo` occupies bytes 8,655,325 through 8,691,330. The selected slash callback at 8,680,979 through 8,681,314 tests the selected built-in effect, deletes only the supplied range, and invokes `ua`.
- The directory arm at 8,667,807 through 8,667,937 opens `ICt`. The renderer import, index export and literal identifier join this to `pick-linked-directories-dialog`.
- OpenConductor's existing `WorkspaceView` already supplies `onLinkWorkspaces` to the composer. Its selection handler instead calls `replaceRange` for every command.

REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` inventories the renderer. Its JavaScript worker exhausted its heap and skipped parsing this asset. This packet therefore records inert compiled-source inspection, not an REA-generated call graph or observed original-app execution. The existing REA gap is preserved. No new acquisition or native execution was required.

The source qualifier passed 29 checks against the retained full assets and current main. To repeat it with the original extracted assets:

```bash
python3 evidence/chat/composer/slash-directory-selection/verify_source.py \
  --main 0a05d2958dd97435b1fc9aab00be50463a229d0b \
  --renderer /path/to/renderApp-D_fmY7hW.js \
  --index /path/to/index-BGEQ8YjU.js \
  --output /tmp/add-dir-source.json
```

## Frozen regression

[The ten-case fixture](../../../../src/features/chat/composerSlashDirectory.test.ts) mounts the actual Composer behind its editor boundary and runs the production adapter against a headless Tiptap document. Focus is a no-op. Attachments remain mounted, suffix text is compared exactly, and adjacent file node identity and complete attributes are retained. The fixture does not start an agent or invoke a native folder picker.

Before any product change, [the initial baseline](baseline-initial.log) produced five intended failures and five passing controls. Enter, Tab, menu selection, suffix preservation and adjacent-file selection all failed because the existing picker callback was called zero times instead of once. Agent and skill name collisions, Plan and Fast text completion, invalid or composing selections, and missing-capability fallback passed.

The first candidate run passed 41 of 42 focused checks. Its sole failure was the multiline oracle expecting one text part where the editor represents a hard break as separate text parts. The actual suffix characters were unchanged. [The original fixture](fixture-initial.ts.txt), [its hash](fixture-initial.sha256), and [that candidate log](oracle-shape-candidate.log) are retained. The repaired oracle compares the complete canonical document JSON and separately requires the exact suffix text, including the newline and Unicode characters. It does not discard or normalize away any field. [The repaired fixture replay against the original main source](baseline.log) again produced the same five intended failures and five passing controls. Its new hash is frozen in `fixture.sha256`.

```bash
COMPOSER_SLASH_DIRECTORY_REF=0a05d2958dd97435b1fc9aab00be50463a229d0b \
  node --test --test-concurrency=1 src/features/chat/composerSlashDirectory.test.ts
node --test --test-concurrency=1 src/features/chat/composerSlashDirectory.test.ts
sha256sum -c evidence/chat/composer/slash-directory-selection/fixture.sha256
```

Test Behavior, Not Implementation kept assertions on the resulting draft, attachment and file identities, picker calls and absence of submission. Type System Discipline reuses the existing typed `SlashCommand.effect` and optional link capability instead of adding another command representation.

## Correction and verification

`Composer.pickCommand` now handles the typed `pick_linked_directory` effect when the existing link capability is present. It deletes only the validated live slash range, dismisses that suggestion and opens the existing picker. Other commands and missing-capability selections retain bounded text completion. No dialog, provider, startup or profile implementation changed.

Passed on Reason Cloud:

- The unchanged repaired fixture and four adjacent suites, 42 tests with zero failures, in [the candidate log](candidate-focused.log). All ten directory cases pass. The other suites cover slash ranges, suffix atoms, directory mentions and command filtering.
- `npm run typecheck` and `npm run build`.
- `sha256sum -c evidence/chat/composer/slash-directory-selection/fixture.sha256` and `git diff --check`.
- The portable source verifier, 29 checks against the complete retained assets and checked main above. Source verification is not app acceptance.

```bash
node --test --test-concurrency=1 \
  src/features/chat/composerSlashDirectory.test.ts \
  src/features/chat/composerSlashAtoms.test.ts \
  src/features/chat/composerSlashPrefix.test.ts \
  src/features/chat/composerDirectoryEntry.test.ts \
  src/features/chat/slashCommands.test.ts
```

No browser screenshot or native recording exists. This lane verifies the mounted Composer and headless adapter only; the existing native acceptance owner retains native execution. Original app runtime behavior, native focus, real IME, folder picking, visual parity and provider behavior are not proven by these checks. No acceptance credit or installed deployment is claimed.
