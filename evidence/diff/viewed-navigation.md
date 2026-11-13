# Viewed-file navigation: retained source proof

Conductor Rebuild compared the retained Conductor 0.87.6 frontend with
OpenConductor main `f81bc428b77012da6eddb590899a56502c1a27ea` on 2026-11-10.
This is a source-only comparison, not a native observation.

## Reference and exact boundary

The retained `renderApp-D_fmY7hW.js` is 11,600,457 bytes and its SHA-256 is
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The asset matches [the existing extraction manifest](historical-chip/extraction.json).
The retained REA application evidence is
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
Its large-chunk semantic coverage is incomplete; bounded, hash-checked literal
reads supplement it. No new extraction, REA analysis or target-code execution ran.

Complete decoded/minified definitions, with UTF-8 half-open byte ranges:

- `pH`, `[2731122,2731473)`, SHA-256
  `f2ff58016cb731dea07ab225de3f6003e1ec5bd5d8ace544d0d84525f4bd0b8d`:
  marks are workspace/path timestamps from `Date.now()`; unmark removes the key.
- `fJe`, `[2731481,2732090)`, SHA-256
  `94dad71f536536d4dabd1f7081e22aa17154f8b2843c29a7fcff9086c455e095`:
  a mark is current when both timestamps exist and viewed time is at least the
  file's modification time. Conflicted, unviewed and viewed groups are sorted.
- `Jqo`, `[9652565,9658452)`, SHA-256
  `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`:
  its shared callback is bound to `diff.toggleViewed` and passed to the file
  header through `bji`/`GPo`. Already-viewed files are unmarked without navigation.
  Otherwise it marks the file, then steps back only if there is no later
  unviewed file and more than one file was unviewed; otherwise it steps forward.
  The existing next/previous handlers wrap at the ends. Empty/missing selection
  is rejected.
- `bji`, `[9643145,9646819)`, forwards the parent callback to `GPo`; the complete
  `GPo`, `[8973445,8975165)`, calls that override when present, rather than its
  standalone store toggle. This closes the actual selected-file/header path.

## Proven OpenConductor mismatch

Both `useWorkspaceDiff` entry points only change the viewed map: the keyboard
binding and the returned `toggleViewed`, which `DiffViewer` passes unchanged to
the header. Neither navigates. This is independent of the unresolved timestamp
producer and does not justify changing our fingerprint storage, file ordering,
filtering or refresh behavior.

The bounded correction shares one callback between both entry points and uses
existing `open`/`step` navigation, preserving the reference's forward/backward
choice and stationary unmarking. No selection, pointer, editor/save, comment
store, IPC, geometry, dependency or workflow changes belong to this correction.

## Regression checkpoint

Nine cases appended to the existing `viewed.test.ts` mount the actual production
`useWorkspaceDiff` with React test renderer. The production viewed, navigation
and keyed-cache functions are used. Boundaries replace only loading/discard,
keybinding registration, storage and the unused whole-file-content loader;
unexpected discard/content loading throws. There is no native IPC or polling
timer: the fixture worktree is null.

The cases cover header and keyboard mark/advance, header and keyboard
unmark/stay, the previous-file fallback, the last remaining unviewed file,
wraparound, singleton and empty/unselected/missing-file guards. The four existing
viewed tests and all selection/pointer assertions remain unchanged.

Hosted RED is verified at published head
`67238bd4597c050205cad4b494bd6fbf31ac1709`: the
[Diff frontend job](https://github.com/reason-machines/openconductor/actions/runs/42799617905/job/129773505107)
ran 174 tests, passed 169 and failed exactly the five new navigation assertions
(header/keyboard advance, previous fallback, final-unviewed advance, wraparound).
The mark itself succeeded; the selected path stayed unchanged. All four new
unmark/guard cases and all 165 previous diff tests passed.
The [full frontend job](https://github.com/reason-machines/openconductor/actions/runs/42799617886/job/129773505910)
also failed exactly those five cases. The hosted typecheck passed; its enclosing
build job then failed at the same frontend tests before the build step.

The minimal correction adds one shared production callback and uses it for both
entry points. It guards a missing file, toggles the canonical current file,
returns on unmark, and otherwise uses existing `open(step(...))` with the
reference's direction condition. No test assertions were changed after RED.
The hosted same-assertion GREEN result is pending, not claimed.

Ordinary hosted command (unchanged workflow):

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

Local `git diff --check` is the source-only whitespace check. Local Node,
dependency installation, builds, app/browser runtime and native testing are not
admitted and were not run. There is no screenshot: visible acceptance remains
unverified, rather than inferred from a hook test or package.

## Separate unresolved imports

The retained UI chunk closes the store and selected-file callback, but not
these imported dependencies from `index-BGEQ8YjU.js`:

- `mt as Gri`: the full file-diff hook and returned `refetch` implementation.
  `bji` forwards its refetch to `GPo`, but the request/cache/error side effects
  cannot be established from that forwarding alone.
- `f1 as _V`: changed-file metadata loading, including the source and units of
  `lastModifiedTime`. Timestamp-versus-fingerprint parity is not fixed here.
- `mY as WDt`: the delete-comment wrapper called by complete `kVo` and `TVo`
  cards. Its complete transaction and store/attachment side effects are absent;
  the older single-row-SQL description does not prove whole-transaction behavior.

The exact missing retained asset is `/assets/index-BGEQ8YjU.js`, 3,493,297 decoded
bytes, SHA-256
`b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, as listed in
[the existing frontend manifest](../frontend/tauri-assets-manifest.json).
That asset is not present in this lane's retained local inputs. The existing
archived REA summary has no occurrences of the four searched semantic names
(`markFileAsViewed`, `deleteComment`, `refetchDiffData`, `lastModifiedTime`);
this bounded absence is not proof that the app lacks those behaviors.
No new acquisition is authorized by identifying this missing dependency.

Native null-selection/pointer propagation, Pierre highlights and #855/#866
actual save IPC remain NOT RUN and receive no credit from this source work.
