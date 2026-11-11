# Active-segment slash completion

Author: Conductor Rebuild.

## Source qualification

Checked main `e8fad6caae23b20ddd81196c54c293e0001accd6`.
The Composer files are unchanged from merged #1006 at `7ede41a2`.

The [retained shipped declarations](../slash-atom-preservation/packet.json) come from Conductor 0.87.6, `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The retained REA evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
All ten declarations in this path matched their retained UTF-8 hashes on this pass.

- `ITo` supplies the slash trigger and passes it into the visible `lHt` editor. Its `z6` query does not require a slash at draft start. It returns no items in queue-edit mode.
- `lHt` supplies `allowedPrefixes: [" "]`. It does not override `startOfLine`.
- `D5o`, `k5o`, and `DIi` install the suggestion adapter. `C5o.allow` checks whether the mention node fits the parent schema, not draft position.
- `E5o` defaults `startOfLine` to false. `b5o` passes that option into `u5o` for an editable collapsed selection.
- `u5o` examines the text node before the caret. A space before `/` is allowed. `o5o` forwards the returned range to `ITo` selection handling.

For `please /re` with UTF-16 caret offset 10, the retained matcher returns query `re` and ProseMirror range `[8, 11)`. The corresponding flattened editor range is `[7, 10)`.
Current-main `slashQuery` returns null for the whole draft. That is a reachable static mismatch, not a native observation.

The new `composerSlashRange` applies the same no-whitespace query rule to the active text segment and carries `{ start, end, query }` to Composer. Completion replaces that range only. A stale menu must not replace another range with the same query. Escape dismissal belongs to its range.

## Regression scope

The new fixture mounts the actual `Composer.tsx` through the repository's React test-renderer pattern. Only the editor and surrounding UI boundaries are substituted. It checks the menu and the exact `replaceRange` arguments emitted by Composer. It does not claim to run WebKit, Tiptap's DOM, native IME, or a provider.

Existing root-only `slashQuery` semantics and tests, `ComposerEditor.tsx`, and the eight suffix-atom regressions are unchanged. The one-line helper re-export in `slashCommands.ts` preserves Composer's existing import path, so the locked VM fixture allowlists are unchanged.

The baseline switch loads only the actual pre-fix Composer source. The new helper and fixture stay available, so the intended RED is a missing visible menu, not a missing module.

```bash
COMPOSER_SLASH_PREFIX_SOURCE_REF=e8fad6caae23b20ddd81196c54c293e0001accd6 \
  node --test --test-concurrency=1 \
  --test-name-pattern='space-prefixed slash opens' \
  src/features/chat/composerSlashPrefix.test.ts
node --test --test-concurrency=1 src/features/chat/composerSlashPrefix.test.ts
npm run typecheck
```

## Verification status

Conductor Rebuild ran one sequential local unit on Reason cloud computer `b3bf539c-baa9-5c0a-bd50-9c4212affce9` against code commit `17463988335115d02a37c9e9e2d495ac553eddf2` on 2026-11-11. Every command used `nice -n19`, `npm_config_jobs=1`, `npm_config_maxsockets=1`, `NODE_OPTIONS=--max-old-space-size=1536`, and `timeout --kill-after=5s`. No command was retried.

1. Dependency installation passed, exit 0, 07:18:28Z to 07:18:33Z. Command `npm ci --ignore-scripts --no-audit --no-fund` had a 180-second bound and installed 393 packages.
2. Baseline RED reproduced the intended defect, exit 1, 07:18:43Z. The pinned-main single-case command above had a 60-second bound. Its actual failure was `space-prefixed slash must reach the visible menu`, expected 1, actual 0. The fixture loaded successfully; this was not a setup or missing-module error.
3. Patched GREEN and unchanged neighboring regressions passed, exit 0, 07:18:55Z to 07:19:01Z. The following command had a 120-second bound. All 24 tests passed, with zero skipped: six prefix tests, eight atom-preservation tests, and ten root-helper tests.

   ```bash
   node --test --test-concurrency=1 \
     src/features/chat/composerSlashPrefix.test.ts \
     src/features/chat/composerSlashAtoms.test.ts \
     src/features/chat/slashCommands.test.ts
   ```

4. `npm run typecheck`, literally `tsc --noEmit`, passed, exit 0, 07:19:12Z to 07:19:41Z, with a 120-second bound.

The unchanged prefix fixture SHA-256 is `69f266c51364c12fe775885f86e52ef527e7c6435c227a313a8849d73bde8148`. The original atom fixture is `ebe2883b9f4b38d9acf8486a5b02122a483dc33bcbd7651444235b2cc112f92d`; the original root-helper tests are `3fd2ebe884d1b85b6a9c8cd1107c3335d8a83812c96a90a4884cc272b80485a5`. Source qualification and `git diff --check` also passed.

The local unit released its execution slot after command 4. No build, server, browser, native app, or provider ran. No screenshot was captured because this admission covered only bounded Node regressions and typecheck. Visual, native, real IME, and real-provider acceptance remain unverified.

## REA limit

The original REA JavaScript analysis worker exhausted its heap and recorded parse status `skipped`. This pass reads retained compiled declarations as inert text. It neither executes Conductor code nor claims an REA-generated call graph. No fresh app acquisition or native probe ran.
