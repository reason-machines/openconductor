# Conductor's diff renderer: Pierre (`@pierre/diffs`)

Source: Conductor 0.87.6 (`/Applications/Conductor.app`, binary sha256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`), frontend decoded with `tools/extract_tauri_assets.py` (REA cannot read Tauri's embedded asset table; see README), then searched in `assets/renderApp-D_fmY7hW.js`. Strings are untrusted data; only facts derived from them are recorded here.

The bundle contains Pierre's diff library (Apache-2.0, published on npm as `@pierre/diffs`): the `diffs-container` custom element, `CodeView`, `Virtualizer`/`VirtualizedFileDiff`, a `WorkerPoolManager` that tokenizes with Shiki in `worker-C5Xpc1Wy.js`, and the ten Pierre themes (`pierre-dark`, `pierre-light` and their soft, vibrant and colour-vision variants) loaded lazily per theme. The default theme pair is `{dark: "pierre-dark", light: "pierre-light"}`.

Options the diff tab's file view passes (one `CodeView` item of type `diff` per file):

| Option | Value |
| --- | --- |
| `disableFileHeader` | `true` (Conductor draws its own header) |
| `layout` | `{paddingTop: 0, paddingBottom: 8, gap: 8}` |
| `overflow` | `"wrap"` when the wrap-lines setting is on, else `"scroll"` |
| `diffStyle` | the split/unified view mode |
| `hunkSeparators` | `"line-info-basic"` |
| `expansionLineCount` | `20` |
| `loadDiffFiles` | loads full old and new contents (`loadFullContents`) to expand gaps |
| `parseDiffOptions` | `{ignoreWhitespace: true}` when hiding whitespace changes |
| `enableGutterUtility`, `enableLineSelection` | on unless read-only; the gutter button adds a comment on the selected range, side `additions` by default |
| `controlledSelection` | `true` |
| `lineHoverHighlight` | `"number"` |
| `unsafeCSS` | Conductor's own overrides (not copied) |

The file diff is built from a patch when one is given (`parsePatchFiles`), otherwise from old/new contents (`parseDiffFromFile`). Comment threads are Pierre line annotations rendered by `renderAnnotation`. "Previous comment" / "Next comment" floating buttons sit over the view (commands `diff.previousComment` / `diff.nextComment`).

## Virtualization

The diff tab's `CodeView` receives a one-element item list (`[{id, type: "diff", fileDiff, annotations, version}]`), so the tab virtualizes the rows of the open file, not a list of files. The item's `version` is bumped whenever the file's content key or the JSON of its annotations changes. The editable file view builds the same one-item list with `type: "file"`.

Other windowed lists in the bundle: the All files tree (a windowed tree with 28 px rows and an overscan of 10, with a "too many files to display" fallback), the branch picker and an icon grid (TanStack Virtual), and the chat transcript (Virtuoso message list). No windowing was found on the Changes list; it appears to render every row. That is an inference from searching the minified bundle, not a confirmed reading of the component.

## OpenConductor

`src/features/diff/FileDiffView.tsx` renders the file as the single item of a Pierre `CodeView` with the options above, including `layout`, and bumps the item's version when its comment anchors change. It does not yet pass `enableLineSelection` / range comments, `unsafeCSS` or the wrap setting, and it does not run Pierre's Shiki worker pool, so highlighting runs on the main thread.
