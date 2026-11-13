# TodoRead uses the returned todo list

Conductor Rebuild validated the original BE7 body-only correction on the Reason cloud computer. `TodoRead` now selects its returned array or bracket-delimited JSON string instead of stale `input.todos`. A present `rawResult`, including null or false, takes precedence over the flattened result string. Invalid strings and nonarrays produce an empty list. `TodoWrite` still uses its input list.

Only the list-selection block in `ToolRows.tsx` changes. Existing labels, empty-state behavior, plain todo projection, mixed-row behavior, RowShell, Transcript, and styles remain unchanged. Header labels and the empty `No todos` disclosure are separate later changes. Malformed arrays containing non-object entries are outside this correction's qualified input domain.

## Measured regression

The unchanged original regression test and its JSON inputs ran before and after the sealed product patch:

```bash
nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/features/chat/todoReadResult.test.ts
```

- Baseline at main `000948134a9685308703438f82250b1ae03f60c8` collected 22 tests. Eighteen intended body assertions failed with `ERR_ASSERTION`; all four controls passed. No tests skipped, cancelled, or marked todo.
- The exact same test and input bytes passed all 22 tests after the result-selection patch.
- Test SHA-256 remains `bc34a5eaeec73fc04db48aa2a4399905baca03912dd26583b86f4fbbfea3e4fd`.
- Input SHA-256 remains `16a3503a1260bf448a01c790e44d7edcbe88a1b6ccf759aac4a3d51bbc16a41a`.

The regression drives the real Reason adapter, reducer, view, and mounted production `ConductorToolRow` with its RowShell. It checks result precedence, stale-input absence, error and pending calls, collapse and reopen, legacy strings, Unicode, and unchanged TodoWrite behavior. Unrelated Markdown, link, and open operations throw if called. The fixture does not execute the Rust mapper, actual Transcript, a real provider, or a native window.

The unchanged adjacent test files passed all 43 tests:

```bash
nice -n 19 env NODE_OPTIONS=--max-old-space-size=1024 node --experimental-strip-types --test --test-concurrency=1 src/features/chat/todoMixedRows.test.ts src/features/chat/toolErrorRetry.test.ts src/features/chat/conductorTools.test.ts
```

The actual checkout typecheck passed:

```bash
nice -n 19 env NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck
```

Typecheck included the existing untracked `malformedMcpLabels.test.ts` without modifying or publishing that separate fixture. No dependency installation, cache borrowing, lockfile change, narrowed discovery, or tsconfig change was needed.

## Source and reference binding

The retained Conductor 0.87.6 REA evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its `G0o` renderer span selects returned TodoRead content, and `D1o`, `Qpo`, and `hIt` close the route into that renderer. The retained renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

[Source binding](source-binding.json) records the exact source pins, original packet and patch identities, and retained REA byte ranges. All 18 renderer, producer, dependency, and config pins matched before execution. The original patch SHA-256 is `80a2c89f86c1bd55a06a4c09570737323d583f737f67b6a0af4c2efd5c0ca348`.

After validation, main advanced to `cafd9bab667f34127aacd01ec8189324463c237f` through the separate Rust lockfile and visual-startup corrections. Normal main incorporation retained all 18 relevant frontend and dependency pins byte-for-byte. No second runtime or rerun is claimed for that incorporation.

Whole proprietary reference assets and raw reference JavaScript are not included. Historical REA semantic renderer analysis exhausted heap and skipped the renderer. Retained byte spans were matched, but installed-app identity and current original-app behavior were not reacquired.

## Raw proof and resource limits

[Raw proof](raw-proof.tar.gz) preserves the original TAP, stderr, literal commands, execution driver, receipt, start, release, and hashes. Its SHA-256 is `3623032c9ba98807db0902dc1d1a69358299e39b1521cc39bcedcfaafd33633b`.

[Validation qualification](validation.json) records the actual allocation. It started at `2026-11-13T01:49:40.242699Z` and released at `2026-11-13T01:52:27.108726Z`, after 166.866 seconds of its 1200-second limit. Complete prebaseline setup took 115.491 seconds within the 120-second source allowance. The raw receipt's 1.783-second source field measures only the earlier fingerprint operation, not that complete setup.

Every recorded command duration was within its stage limit. Sampled process-group RSS peaked at 1,292,316 KiB; this partial observation is not an exhaustive memory proof. All owned runtime groups were empty at release.

## Acceptance gaps

Native and browser behavior, screenshots, real-provider emission, Rust execution, build, package inclusion, and release acceptance were not run in this allocation. There is no screenshot because the admitted correction used mounted component tests and explicitly excluded native or browser runtime. Passing this regression does not establish full TodoRead visual parity.
