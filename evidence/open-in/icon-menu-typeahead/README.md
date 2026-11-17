# Icon Open in menu type-to-focus

Conductor Rebuild / `ICON-MENU-TYPEAHEAD-SAME15`.

## Reference contract and current-main reproduction

Original main checked: `d90bed88174656d577adfa793d3850d28eaea7e2`. Integration baseline: actual #1454 squash `acd37606d6159470ba46c4be8d748885133aed4d`, fetched after GitHub confirmed its merge. OpenInButton is byte-identical at both pins; `integration.json` preserves the distinction. The icon-only Open in menu handles arrows, endpoints and Escape, but ignores printable characters. The split popover has a different retained contract and is not a typeahead target.

The already-retained real Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, retained REA lineage `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. This pass rehashed and parsed that whole parent; no fresh app acquisition, native observation, or reference-JavaScript execution occurred. `source.json` pins 42 complete AST declarations/initializers with exact UTF-8 ranges, lengths and hashes. The verifier compares each span to the parent bytes and parses both, without evaluating vendor code.

The complete event/label/focus chain is:

- `P9`'s icon branch renders `h2` and `cFn`. `h2` renders `oF`, which calls **`$li`**, the separate typeahead hook. `SLt` owns list navigation/focus, not the prefix matcher itself.
- `oF` passes item-label and item-element refs, its active index and `resetMs:yDr` (`yDr=500`) to `$li`. It merges `$li.floating` into published `popupProps`. `Tm → m2` consumes those props; complete handler-merger declarations and the outer exclusion guard are retained.
- `cFn → Yc → Pu → wD` registers app rows and Copy path. `Tm → b2 → Sde` fills labels from an explicit label, otherwise text-ref content, otherwise row `textContent`, in DOM order. No inferred app-name-only reference lookup is substituted.
- `$li` matches case-insensitive prefixes from the row after the initial active index, wraps, retains a multi-character query and resets after 500ms. A repeated key cycles only when no eligible label begins with a doubled first character. Nonmatching non-space input clears the failed prefix. Ctrl, Meta and Alt characters are ignored.
- Existing typing plus Space is consumed and remains searchable; initial Space is not consumed by this hook. Item `r0i` separately prevents Space activation while typing. Visibility/disabled checks are retained. Blur outside both trigger and popup clears the prefix; internal focus movement preserves it. Open/close state and the timer hook's disposal path clear stale typing.
- `oF.onMatch` changes the menu active index only while open. `SLt`'s active-index effect then focuses the registered element without launching or copying. Type-to-focus is not type-to-execute.

The historical endpoint increment explicitly excluded typeahead, but that exclusion alone was not used as a defect oracle. The complete new closure plus actual current-main failing assertions supplies qualification.

## Frozen mounted regression

`src/features/openIn/iconMenuTypeahead.test.ts` mounts the actual production OpenInButton and actual apps adapter with React test renderer. It drives the actual menu callbacks. DOM focus nodes, time, native IPC and preference writes are synthetic and recorded. It is not a browser or native input test.

Frozen27 SHA-256: `5de8fc5655468b118cd6efda351fa486a27913a694b7ea330dd3b5895129784a`.

On unchanged current main, the frozen fixture reports **13 passing controls / 14 intended `ERR_ASSERTION` failures**, zero skips/cancellations. The targets cover ordinary and shifted-case prefix focus, multi-character matching, repeated-letter cycling including Copy path, wrap, the 500ms boundary, no-match reset, disabled/hidden matches, doubled-first-letter labels, internal-space matching and internal blur. Controls retain modifier guards, split behavior, initial Space, existing prevented-event policy, unrelated keys, arrows/endpoints/Escape, close/reopen, cleanup and positive exact launch/clipboard instrumentation.

Before freezing, one scratch fixture used two incorrect IPC command/order expectations and one incomplete timeout sequence. They were corrected by reading the actual apps adapter and retained matcher, not by changing product code. The original scratch fixture and raw diagnostic are retained in `prefreeze/`; they are not a qualifying baseline or a passing result. All subsequent regression comparisons use the unchanged frozen27 bytes.

## Commands and verification boundary

```bash
node --test src/features/openIn/iconMenuTypeahead.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/features/openIn/*.test.ts
node evidence/open-in/icon-menu-typeahead/verify.cjs <already-retained-renderer.js>
git diff --check
```

Initial qualification passed **235 source/fixture checks**. Ledger collision clearance then admitted only OpenInButton's local icon-menu prefix/ref/timer/key/blur/lifecycle seams plus the new test/evidence. The frozen27 was rerun on the byte-identical actual `acd37606d615` baseline: **13 controls PASS / 14 intended assertion FAIL**, zero setup failures, cancellations or skips (`fresh-acd-red.tap.gz`).

The minimal product treatment adds a local prefix and starting/matched index, the retained 500ms timeout, rendered-label prefix selection, repeat-key cycling with the doubled-first-letter exception, eligible-row checks and cleanup on menu exit/close/unmount. It focuses only; existing app launch/copy handlers are unchanged.

After treatment, the **same frozen27 passes 27/27**. All Open in tests pass **107/107**, with zero skips/cancellations. No existing test or loader needed modification. No app catalog, native launcher, AppSwitcher, palette, keybinding, CSS or cloud UI change. Heavy typecheck/build and hosted publication/CI are still pending at this verified preservation milestone; no runtime admission is implied.

The qualified fixture/evidence was preserved first in isolated commit `5f2af5074`, then replayed as `f790a9833` onto the actual #1454 squash. Product work remained in that separate main-based worktree, never appended to #1454.

## Acceptance gaps and REA limits

No browser/native runtime or package admission was granted. There is no screenshot: browser event propagation, real button default actions, physical typing/timing, geometry, VoiceOver, installed identity, actual launch/clipboard and packaged acceptance are **NOT_RUN**. Mounted callback checks are not physical-key or macOS proof. Earlier REA analyzer heap/zero-file parsing limitations remain recorded in their original packets; this inert AST pass encountered no new REA failure.

For the existing release owner only: after a successor is admitted, prove packaged/embedded inclusion of the eventual actual squash, then open the icon menu and type case-insensitive app/Copy path prefixes, repeated letters and a multiword prefix; check the 500ms reset, focus-only navigation, disabled/no-match controls, unchanged split keys, and unchanged exact click launch/copy. Neither source merge nor a passing production build closes those acceptance gaps.
