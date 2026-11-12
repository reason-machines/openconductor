# Secret editor Save/Cancel traversal

Author: Conductor Rebuild. This change is outside the frozen #992 package cut.

## Change and source

The only product change moves SecretInput's existing Save button before its existing Cancel button in `src/settings/agents/kit.tsx`. It changes no props, handlers, styles, tabindex, callers, status loading, native code, copy behavior, or Get key behavior.

Fresh `origin/main` was fetched and inspected at `f3a52c4aaa59d12e2d0050e2997174be30a59cac` before the patch. It contains #1159 merge `2fa48639cf046d5d4ff8826f84025570808f8eb2`; its editor still declared input, Cancel, Save. Five source identities are recorded in `successor-source-prep.json`. Earlier receipts retain their original checked commits; they are not new runtime observations.

The original Conductor archive SHA256 is `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`. The immutable v2 source packet SHA256 is `e7d702af466ab5054429a0ac63971c43aa8832d09c4f99095d590a17ea4af725`. Both asset hashes and all 11 UTF-8 half-open spans in `source.json` were verified byte-for-byte against the retained original archive. Original JavaScript was read as untrusted data, never executed.

Retained REA lineage: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The complete source join is `$pa` → `jpa` → `YWt` → `n$i`. Zla's Edit action opens the initially empty editor; n$i declares input then Save; YWt declares Cancel/Get key afterward. Qo is an ordinary input; tt → S3i → prop merge/native rendering preserves the button type and supplied props. No focus/tabindex override was found within these retained spans. This is static source evidence, not native focus observation. No new REA tool was invoked and no new REA tool failure was encountered.

## Frozen behavior check

`tests/chat-search/secretEditorTraversal.dom.test.mjs` is unchanged from the supplied fixture. Its SHA256 before RED, before GREEN, and after GREEN is:

`1b6157500cf020ede46da5477325774f099ce0a47dff52c44560c1be36f4c53c`

The fixture mounts the real ClaudeTab, status loader, SecretRow and SecretInput. User-event simulates focus, Tab and Enter. Only transport/credential/clipboard/native boundaries are mocked. The only replacement is the fake value `fixture-only-not-a-key-1234`, entered with surrounding whitespace. It does not retrieve a real credential, use a real provider, or read/write the real clipboard.

All commands ran sequentially on Cloud computer 352, UUID `00637189-5c55-416e-b457-ed7419fb739a`, with a 120-second timeout per command. ACC grant `604d9d6a-e2ea-4a57-acfb-b9f9f442dab1` admitted one exact-pin prefix bootstrap, one RED, one GREEN, and only the two adjacent checks below. The runtime slot was explicitly released after all foreground commands terminated; no background jobs remained.

### Isolated dependencies

One new exact-pin bootstrap passed, exit 0; it was not a previously locked restore:

```bash
timeout 120s npm install --prefix "$PWD/.ara-state/secret-editor-traversal-dom-deps" --ignore-scripts --no-audit --no-fund --save-exact react@18.3.1 react-dom@18.3.1 react-test-renderer@18.3.1 typescript@5.9.3 jsdom@26.1.0 @testing-library/user-event@14.6.1 @testing-library/dom@10.4.1
```

`dependency-package.json` and `dependency-lock.json` preserve the prefix manifest and generated lock. Installed versions, root lock dependency pins, and package-lock entries were all checked. The prefix lock SHA256 stayed `33bfaf38a46cedeb4c28f81d702e0a8c44416e3dec55583b9568d8c4a88569db` throughout.

Product `package.json` stayed `ae9c95902b3d7bab8a600f35e693637286b58235868b2203370c7667add3e9ac`; product `package-lock.json` stayed `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`. No root install or lifecycle scripts ran.

### Actual RED, then identical GREEN

Exactly the same command and fixture ran once before and once after the product edit:

```bash
timeout 120s env ONBOARDING_DOM_DEPS="$PWD/.ara-state/secret-editor-traversal-dom-deps" node --test --test-concurrency=1 tests/chat-search/secretEditorTraversal.dom.test.mjs
```

RED failed as intended, exit 1. One Tab focused Cancel instead of Save, and Tab then Enter saved zero replacements. Direct Enter, explicit Cancel, pending-disable/double-submit, and whitespace-only controls all passed. No test setup/mock/dependency failure occurred.

```text
# tests 6
# suites 0
# pass 4
# fail 2
# cancelled 0
# skipped 0
# todo 0
```

GREEN passed, exit 0, after only the existing button DOM order changed:

```text
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

`red.json` retains the complete unmodified RED output in `raw_output` (JSON encoding preserves TAP whitespace); `green.txt` retains GREEN. An initial metadata-only Python quoting error preceded RED. It was corrected after RED and before any product edit; all seven dependency pins, the root manifests, unchanged fixture, and unchanged baseline were then verified. ACC explicitly accepted this sequencing in `ca880f7c-9d9f-49f6-b1c9-200deb7758be`. `metadata-capture.txt` preserves the exact error and correction; the first capture is not claimed as passing. No reinstall or RED rerun occurred.

### Unchanged adjacent checks

Stored-value copy passed 9/9, exit 0:

```bash
timeout 120s env ONBOARDING_DOM_DEPS="$PWD/.ara-state/secret-editor-traversal-dom-deps" node --test --test-concurrency=1 tests/chat-search/secretValueCopy.dom.test.mjs
```

Secret editor Get key behavior passed 4/4, exit 0:

```bash
timeout 120s env NODE_PATH="$PWD/.ara-state/secret-editor-traversal-dom-deps/node_modules" node --experimental-strip-types --test --test-concurrency=1 src/settings/agents/secretEditorKeyLink.test.ts
```

Both adjacent fixtures and the two signed-out Refresh fixtures remain byte-identical to the checked main commit. Their original raw outputs are retained in `adjacent-copy.txt` and `adjacent-key-link.txt`; machine-readable results and final hashes are in `results.json`.

## Verification limits

- JSDOM/user-event focus and activation passed; this is not native/macOS keyboard acceptance.
- No screenshot: a running browser/app UI was not admitted.
- Signed-out Refresh checks, local typecheck/build, native, real-provider, package and E2E runs were not admitted and were not run. Automatic hosted checks are tracked separately on the exact PR head. Skipped/manual workflows are gaps, not passes.
- No workflow or package-manifest changes are included. The isolated dependencies above are required to run this frozen fixture; the existing manual frontend-unit dependency bootstrap was not expanded.
- No frozen #992 release/package scope was changed. The existing #992 owner retains that work.
