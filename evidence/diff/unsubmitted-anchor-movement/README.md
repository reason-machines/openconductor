# Unsubmitted comment anchors follow editable file movement

Conductor Rebuild. Dedupe `DIFF-UNSUBMITTED-ANCHOR-MOVEMENT-DE6-01`.
Qualification baseline: fresh main `eef01e9b287472280fb3f4a585bc697d5f1f8f51`.
This packet is source/component evidence, not native or visual parity acceptance.

## Retained real-Conductor contract

The already-held REA-derived Conductor 0.87.6 renderer is
`renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
`source.json` references eight complete inert spans (18,574 bytes), their hashes,
retained UTF-8 ranges where available, and 28 explicit literal joins:

1. `OMi` creates a UUID-keyed `state: "draft"` comment when the user selects
   an inline range. Its annotation filter does not exclude draft state.
   `dVo` preserves the entire comment as annotation metadata, including its ID.
2. Editable `kqo` maps **every** annotation's `metadata.id` to the live line,
   including a null removal. Its late resolver projects the original annotations
   through that pending map before `BMi` measures/counts/navigates. `wet` renders
   the draft through `SVo`; submission addresses the same `n.id`.
3. `kqo` invokes `OMi`'s persistence callback only on save/completion. That
   callback applies the absolute line map as a delta to both range endpoints;
   it does not skip local draft rows. Null removals are not persisted.
4. Read-only `$Vo` uses the original annotation positions. The earlier #1406
   bounded review's post-render/change timing observation is not a new finding.

The spans and prior `Tj`→`kle` import/export alias receipt are reused from the
new-inline-draft-remount and live-comment-navigation evidence. Full raw assets
were not reacquired or rehashed this increment. `kle`'s complete retained body
is hashed, but this increment does not establish its raw index byte range.
No extracted JavaScript was executed, imported or evaluated. The earlier REA
large-renderer semantic-budget gap is unchanged; no new REA failure occurred.

## Concrete current-main mismatch

`ReviewComments.anchors()` gives stored threads `commentIds`, but composing-only
anchors have no ID. `FileDiffView`'s already-delivered live-position resolver can
only track `commentIds`. Consequently a new unsubmitted draft stays at its old
navigation position even when real Pierre annotations move or disappear. On
completion, only stored comments move; a draft sharing their old line splits off
at its old range. Submission generates a replacement ID, also losing any live
mapping before the subsequent file save.

The qualification fixture uses the real review hook, FileDiffView, CommentNav,
nav/pierre adapters, comments/local store, React 18.3.1, Pierre 1.6.4 TextDocument
and `applyDocumentChangeToLineAnnotations`. It exercises unified, split and
whole-file views. CodeView's viewport geometry/render surface, IO, keybinding
map and unrelated chrome are explicit deterministic boundaries. The fixture
invokes actual production edit/completion callbacks; it is not a DOM editor.

## Frozen paired regression

`src/features/diff/unsubmittedAnchorMovement.test.ts` V2 was frozen at checkpoint
`9900f381`, SHA-256
`13d5d967cd8456b92bc48076f103fce2967fc910b2007b1b4099057efdfea429`.
Two pre-freeze TypeScript boundary-narrowing errors were corrected. The original
V1 (`57b71441`, SHA-256 `8ded2ee6b43f5f33629e0e63d172f7e0712b38522225c45f8d9adee4cca21fcf`)
produced RED 12/12 and treatment 18/24: six newly reached row lookups incorrectly
expected persisted bodies to retain outer whitespace, while unchanged
`newLocalComment` trims them. Ledger accepted exactly two post-submit lookup
predicates changing to `body.trim()`; all 24 cases and exact unsubmitted-body
assertions remain intact. V1 bytes/logs and the exact V2 diff are archived under
`history/`. The same byte-identical V2 ran against baseline and treatment.

```bash
DIFF_UNSUBMITTED_REF=eef01e9b287472280fb3f4a585bc697d5f1f8f51 \
  node --experimental-strip-types --test src/features/diff/unsubmittedAnchorMovement.test.ts
# RED: 12 controls pass / 12 intended failures.
node --experimental-strip-types --test src/features/diff/unsubmittedAnchorMovement.test.ts
# GREEN: unchanged V2 fixture, 24 pass / 0 fail.
node --experimental-strip-types --test src/features/diff/*.test.ts
# PASS: 594 / 594, including the original #1406 and new-inline-draft fixtures.
npm run build
# PASS: branding, tsc --noEmit, Vite build. Existing chunk-size/import warnings.
python3 evidence/diff/unsubmitted-anchor-movement/verify-reference.py
# PASS: 8 spans / 18,574 bytes; 28 literal joins; frozen fixture.
npx tsc --noEmit
# PASS at the frozen qualification checkpoint.
```

Failures, in each of three layouts: moved draft counts/target before save;
removed draft still counted; completion separates a shared-line draft from its
stored thread; submission replaces the pending identity and navigates to the
later comment instead (line 50, expected live draft line 25).

Preserved controls, each layout: unchanged draft body/original navigation;
Undo of insertion restores original navigation without persistence; cancel and
new UUID do not inherit the old map; read-only original positions stay unchanged.
The shared-line completion case additionally requires exact range preservation
and no double shift on repeated completion. Existing #1406 and prior
new-inline-draft-remount fixtures remain byte-for-byte untouched.

## Smallest repair boundary

One production path: `ReviewComments.tsx` only. Composing UUIDs now feed the
existing `commentIds` annotation path (also when sharing a stored-thread line).
Submission preserves that UUID. The save/completion callback applies the
absolute anchor delta to composing ranges; null/undefined/unchanged positions
remain untouched. This neither persists during keystrokes nor changes stored
comment mutation ownership. No global identity helper, backend/store design or
CommentNav/FileDiffView edit was needed.

The existing 570-case Diff suite passed independently, then the full final
594-case suite passed. The initial combined suite/build call timed out after
180 seconds during Vite gzip computation, so that build was partial, not a pass.
A separately completed `npm run build` passed. Immutable compressed logs and
`checks.json` record exact result/file identities. The historical optional paired
workflows remain manual-dispatch-only; they were not dispatched or repinned.
Existing frozen fixtures and workflow files are unchanged.

## Verification limits

No real contentEditable/WebKit/Pierre post-render timing, native key dispatch,
scroll animation, clipboard, provider, Mac/app installation or side-by-side
capture was exercised. No screenshot is supplied because no browser/native
runtime was admitted. #1406's containing-package and native acceptance remain
with the existing release/sole-executor owners. No new package/runtime/native
request, dispatch, executor or watcher was created.
