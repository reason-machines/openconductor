# Live, unsaved comment navigation (Q-07)

Conductor Rebuild. Dedupe: `DIFF-Q07-REA-MEASUREMENT-BINDING-DE6-01`.
This is a narrow source repair, not macOS/native/side-by-side acceptance.

## Reference and exact chain

Recovered already-held Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js`,
11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The original-byte repack is 3,475,109 bytes, SHA-256
`ca33ccd3b7e25e947925c8f2f26c45cfe2f1eb66f05c6bc45c50f3a74b93d8d7`;
its raw member is at archive root. Parent/ledger restored portable access; this
was not a new vendor acquisition. Existing REA large-renderer semantic-budget
limitation from `evidence/diff/comment-navigation.md` remains. No reference code
was executed, evaluated or imported.

`source.json` pins all **19 complete consumer/helper/method spans, 23,163 bytes**,
with UTF-8 half-open ranges, byte lengths and SHA-256 hashes. Key bindings:

- `$Mi [9429455,9430800)` consumes counts/navigation, registering previous/next
  one priority step above high; hash `f329a09f62fc894bc1a565350986c8a96fd04dbf2be1d45ab0a8ca4cd3f8e7d0`.
- Editable `kqo [9628186,9633515)` records pending annotation positions/removals;
  its late resolver omits removed annotations and projects current line numbers.
  It passes that resolver into `BMi`; `onItemEditChange`, scroll and post-render
  are joined to the same Pierre item/handle. Hash
  `3af80b1ec23526b5f7da46310901c69f22cb9965ef67fba947801071ede1bcc1`.
- Read-only `$Vo [9431499,9436022)` passes original annotations instead; both
  callers render the same `$Mi` and bind the same scroll/post-render consumer.
- `BMi [9427960,9429424)` calls the late annotation resolver before every
  measurement/navigation. It joins `rEt` (item/container/Pierre measurements),
  `QQn` (side/line deduplication) and `jVo` (visible-band counts/targets).
- The retained Pierre React `oXr` forwards scroll subscription and imperative
  `scrollTo/getInstance`. Complete getRenderedItems/getTopForItem/container,
  file/diff getLinePosition, subscription, scrollTo/target/alignment methods
  close the direct source chain. Alignment retains the 56px offset and smooth
  start-aligned request. These spans are source bindings, not measured DOM output.

## Concrete mismatch and repair

Measured default branch: `91de35a7e10199675bc43d9b29516cd8ec18f4a0`.
`FileDiffView.tsx` already recorded Pierre's moved annotations for later save,
but `useCommentNavigation` still measured original, persisted anchors. Inserting
lines could leave the next-target/count at the old location; deleting an anchor
could leave a stale navigation target until save. The existing moved-anchor
persistence regression intentionally stubs CommentNav and did not cover this.

The two production paths remain the complete fix boundary:

- `FileDiffView.tsx` resolves navigation anchors from its existing pending-position
  map while editing. A first deletion is recorded even without a previous move.
  It neither persists nor mutates comment metadata during navigation.
- `CommentNav.tsx` accepts an optional late resolver and uses it for refresh,
  scroll and navigation. Existing static-anchor callers, target selection,
  deduplication, key priority, scroll alignment and save/completion ownership stay
  intact. No new store, backend or editor behavior is introduced.

## Frozen regression and checks

`src/features/diff/liveCommentNavigation.test.ts`, SHA-256
`76f19b8a6ade5f8d61ff6656efe2dce9a89970529da64fbff4831018bf63a08c`,
is frozen at `8ac30187`. Its initial checkpoint `273cd4f8` was corrected only to
replace a recursive test-boundary type with `unknown`; the final byte-identical
fixture was then run on baseline and treatment:

```bash
DIFF_Q07_REF=91de35a7e10199675bc43d9b29516cd8ec18f4a0 \
  node --experimental-strip-types --test src/features/diff/liveCommentNavigation.test.ts
# RED: 3 unchanged-anchor controls pass, 6 moved/deleted pre-save cases fail.
node --experimental-strip-types --test src/features/diff/liveCommentNavigation.test.ts
# GREEN: 9 pass, 0 fail; identical fixture SHA.
node --experimental-strip-types --test src/features/diff/*.test.ts
# Final frozen fixture: 570 pass, 0 fail.
npm run build
# Branding, tsc --noEmit and Vite build pass after the type-only correction.
python3 evidence/diff/live-comment-navigation/verify-reference.py
# Retained spans + explicit lexical joins + frozen fixture identity.
# Optionally append a recovered raw renderer path to verify full-asset identity
# and each span's exact membership; never execute the renderer.
git diff --check
```

The fixture mounts the actual FileDiffView/Code, useCommentNavigation and
CommentNav with real React 18.3.1. It loads actual nav/pierre adapters. Real
Pierre 1.6.4 TextDocument edits and applyDocumentChangeToLineAnnotations produce
both insertion and removal events across unified/split/file layouts. Unchanged
anchors/count/navigation pass; persisted metadata stays unchanged and no save or
IPC occurs. The viewport/CodeView handle is a deterministic structural test
boundary, with synthetic line geometry and scroll capture. UI chrome and external
keybinding registration are isolated; no browser, editor DOM, clipboard, native
key event or actual scroll animation is exercised.

Historical immutable logs (gzip-compressed verbatim): `red.log.gz`,
`green.log.gz`, `diff-suite.log.gz`. The final
full-suite/typecheck/build results are source checks only. The Vite build emits
its existing large-chunk warning. No package or native receipt for this new repair
exists, and none is requested/dispatched here. Original #1378/#1388 package/native
ownership and subscriptions remain separate and unchanged.
