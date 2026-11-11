# Branch input autocomplete contract

Conductor Rebuild owns `HEADER-AUTOCOMPLETE-271-03`. The branch editor must declare the retained shipped input's `autoComplete="new-password"` hint rather than `off`. This is an attribute-contract correction, not a claim about native suggestion or password-manager behavior.

## Retained source

The comparison was revalidated against main `697ba00b2fec7ea4151b771603f57b3f6874191d` on 11 November 2026. No new reference acquisition or runtime was used.

- [Retained trace](reference-static.json): 8,311 bytes, SHA-256 `4901177a0829b07b8414a5d4b9c8adf091f9549f8dc9dafac5ebbcb79a01588e`, git blob `f553fa75066ac57d1b958ec193ce36760e1eae94`.
- [Retained REA graph](../frontend/rea-analyze-javascript-application.json.gz): 44,783,232 bytes, SHA-256 `b0ffc795bf955a3dd54fd9bfb15d7eadf23ef6768c330c2e2223cc8581c8578f`, git blob `90b801cb23bc10e4780c9a1e48c8f358bc859686`.
- REA evidence ID `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Both retained artifact hashes occur in the graph's identity records: renderer `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` and index `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- The complete retained `bro` excerpt is 2,977 UTF-8 bytes, SHA-256 `ef7bdf8d88ab7587123cab8ccf81848f4bed54685987b2fe2373ff4cbbcd613b`.

The excerpt directly binds the hint to the editing branch input:

```javascript
p.jsx("input",{disabled:r.isPending,type:"text",value:o,onChange:de,onBlur:k,onKeyDown:L,autoComplete:"new-password",spellCheck:!1,autoFocus:!0
```

Within `bro`, the unique `autoComplete:"new-password"` literal occupies zero-based half-open UTF-8 and UTF-16 span `[1409,1436)`, SHA-256 `03c6e54db90e928ff827215c1e9cf7c019c3ad56b1eb989fde17554aa3f89061`. The absolute UTF-8 span `[7207634,7207661)` is a retained declaration only. Original full assets were not reacquired or rehashed. Extracted source was read as inert evidence, never evaluated.

## Source pins and scope

At checked main:

- [Component](../../src/components/WorkspaceBranchHeader.tsx): 4,078 bytes, blob `b7d32457342a24fc416a500bced5897607b62d1a`, SHA-256 `7981446fa68d4491a752cb1bd72583b544751c11d0e62400cae96b96315430e2`. The editing input declares `autoComplete="off"`.
- [Existing tests](../../src/components/workspaceBranchHeader.test.ts): 19,093 bytes, blob `de5915b0687bb69ad82f5ace2e456a86a059bfdd`, SHA-256 `997ad07bd895f8d9e038fe63d37bbd8e5e8d304749a65c2bc9ec787f2f9ed643`.
- [Unchanged controller](../../src/components/branchHeaderController.ts): 3,374 bytes, blob `1b889bdd3a7dd4836fe7931c48c5696007ee272c`, SHA-256 `11718ed1cdb81b08352dfff1fe09ca72c3f7e1b49aa0178fa707bc59edef396f`.

Only three paths are cleared: this receipt, one additive mounted-component test in the existing test file, and the component's autocomplete prop. Controller, caret callback, focus, width, menu, copy, submission, pending state, archive behavior, basename, and provider policy are excluded.

## Regression and validation

The additive test mounts the actual TSX through the existing `react-test-renderer` fixture, opens the editor with its actual button handler, and reads the mounted host input's `autoComplete` prop. It expects `new-password`. The complete prior test file is recoverable byte-for-byte by removing only the new test. No fixture, import, event, context, or existing assertion changes are needed. The original 76 assertions and all caret-regression bytes remain unchanged and in order.

```bash
node --test src/components/workspaceBranchHeader.test.ts
node --test "src/**/*.test.ts"
npm run typecheck
npm run build
```

- **Passed on Reason Cloud:** retained trace and graph hashes, artifact membership, complete `bro` hash, direct input binding, literal spans, unchanged controller, and exact preservation of the whole previous test file.
- **Passed:** `node --experimental-strip-types --check src/components/workspaceBranchHeader.test.ts` and `git diff --check`.
- Regression-file SHA-256: `bad3e380eddfab814b98c94d206d4951bbe1acc6d4b9a1ca0120e446150567b1`. This file must remain byte-identical through the production fix and passing-after check.
- **Hosted RED pending:** the regression-only increment leaves the production prop unchanged. Expected failure is actual `off` versus expected `new-password` at the mounted attribute assertion, not a loader or setup failure. No production fix is applied before this failure is observed.
- **Hosted GREEN pending:** after the intended RED, change only the production prop and rerun the unchanged test.
- **Not run locally:** dependency installation, component execution, typecheck, or build. Hosted checks provide those results separately.

## Acceptance limits

The mounted check reads a React host-input prop, not a browser DOM or a native input. Native suggestions, password-manager popups, focus, visual parity, installed-Mac behavior, and real-provider acceptance remain unverified. No screenshot is supplied because browser and native execution are outside this lane's admitted scope. No new REA invocation or gap was encountered. Basename held source and behavior were not used or edited.
