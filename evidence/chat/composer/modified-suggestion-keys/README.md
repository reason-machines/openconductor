# Modified keys in composer suggestions

Conductor Rebuild fixes `COMPOSER-SUGGESTION-MODIFIED-KEYS-135-01` on main `f62f81ab601edb5be27a99e0a92882f13306e2aa`.

An open mention or slash menu now handles ArrowUp, ArrowDown, Enter, and Tab with Shift, Meta, Ctrl, or Alt held. Consumed keys prevent default and stop propagation before send or newline commands. The four menu branches are the only product changes. The IME guard, plain queue-focus guard, no-menu send and newline actions, keyboard cancellation, and AddMenu are unchanged.

## Retained original-app evidence

[Retained source qualification](retained-source.json) records Conductor 0.87.6 compiled spans from the real app. The internal `o5o` suggestion handler and shared `lHt` editor use the identity-wrapped `uqn` key selector without modifier filtering. The editor handles suggestions before send and newline commands and stops propagation for consumed keys.

The retained renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Historical REA analysis `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` exhausted its JavaScript worker heap and skipped semantic parsing. These are inspected compiled-source spans, not a successful semantic call graph or a fresh installed-app observation. No new REA invocation or failure occurred.

## Baseline, fixture repair, and unchanged candidate check

The [original frozen fixture](original-fixture.ts.txt), SHA-256 `ac3f9b763e760005341e2b278763d62bf777b599f517e99ce58772cdfb6ddfa2`, ran before the product fix. [Original TAP](red.tap.gz) records 25 failures and 11 passes. Twenty-four failures concern the intended modified-key behavior. Case 36 is a fixture bug, not a reproduced product defect.

The fixture's submission callback implicitly returned `Array.push()`'s numeric result. Current Composer accepts `void | Promise<void>` and leaves draft clearing to a callback that returns a truthy pending result. A [one-line contract repair](fixture-contract-repair.patch) makes the callback return void. Every case and assertion remains unchanged. This was not an asynchronous timing fix.

The corrected fixture was frozen as SHA-256 `f5813de44aea1fbf56358415e754c7620ad908da00068491e7ed0f94eb6e72bf` before product editing. [Corrected baseline TAP](red-v2.tap.gz) records the intended 24 assertion failures and 12 passing controls. After the four-branch fix, the identical corrected fixture passed all 36 cases in [candidate TAP](green.tap.gz). It is not byte-identical to the original fixture.

Both corrected baseline and candidate used this command:

```bash
nice -n19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/composerSuggestionKeys.test.ts
```

## Adjacent checks

[The first adjacent run](adjacent.tap.gz) passed 58 of 62 cases. Four directory-completion cases failed because an older keyboard-event double lacked `stopPropagation`. The directory and atom test helpers now use cancelable, bubbling Node events. Existing assertions remain, and both helpers assert propagation is stopped. The product does not special-case incomplete test doubles.

[The final adjacent run](adjacent-v2.tap.gz) passed all 76 cases:

```bash
nice -n19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/composerQueueFocus.test.ts src/features/chat/composerFirstVisualLine.test.ts src/features/chat/composerSlashDirectory.test.ts src/features/chat/composerMinimize.test.ts src/features/chat/composerAsyncSubmit.test.ts src/features/chat/composerCancelFocus.test.ts src/features/chat/composerSlashAtoms.test.ts src/features/chat/composerSlashPrefix.test.ts
```

[Execution receipts](execution.json) retain commands, exits, elapsed times, source hashes, and the explicit runtime release with no remaining jobs. The gzip files preserve raw TAP bytes, including Node's whitespace in failed-assertion diffs. The receipt pins each decompressed hash. Python's monotonic clock replaces the previously unavailable `/usr/bin/time`. These times are execution receipts, not performance measurements. Existing dependencies were used without installation. `git diff --check` and the [evidence hashes](SHA256SUMS) passed.

## Verification limits

The tests drive actual Composer through mocked editor, menu, backend, preferences, and registration boundaries. They do not execute the production Tiptap dispatcher or an ancestor listener. Synthetic composition controls do not prove native IME behavior.

There is no screenshot or recording because the serialized grant excluded browser, server, native, and provider execution. Native behavior and visible parity remain unverified. Local typecheck, build, install, packaging, and distributed-release acceptance were not run. Hosted CI and release inclusion are separate checks. AddMenu29 remains a distinct, unexecuted queued unit.
