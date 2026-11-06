# Alignment sweep: workspace header actions

Sven's report (`native-openconductor-header-misaligned.png`, from the native app on his Mac): the header's Open-in split button and the Archive button do not line up.

## Conductor (REA-extracted frontend, `renderApp-D_fmY7hW.js`)

- The header's action group is `flex items-center gap-1.5` (6px gap).
- Its buttons use the shared button's `xs` size: `h-6 px-2 text-xs gap-1.5 rounded-sm` (24px tall, 8px side padding, 12px text, 4px radius), with `size-3` (12px) icons. The Archive button adds `h-6` when the size is `xs`.
- The Open-in split button uses the same height (`h-6`) for both halves.

## Before (main `ff1dec61`)

Measured by `tools/align/header_actions.mjs` (Chromium headless, 1440x900 @2x), from [`header-before.json`](header-before.json):

| Control | Height | Vertical centre |
|---|---:|---:|
| Open in (main, chevron) | 24 | 46.56 |
| Create PR, caret | 26 | 46.00 |
| Archive | 26 | 43.00 |
| Title chips (branch, Idle) | 20 | 44.50 |

Three heights and four centre lines in one header. Archive sat 3.5px above Open in, and the PR caret overlapped Create PR by 3px.

## After

| Control | Height | Vertical centre |
|---|---:|---:|
| Open in, Create PR, caret, Archive | 24 | 42.00 |
| Title chips | 20 | 42.00 |

Every action control is 24px tall on one centre line, and the title chips share it. Both themes pass ([`header-after.json`](header-after.json)).

## Changes

- `.ws-actions`: `display: flex; align-items: center; gap: 6px` (it had no rule, so its inline children aligned to the text baseline).
- `.ws-actions .btn-small`: Conductor's `xs` size (24px tall, 0 8px, 12px/16px text, 4px radius).
- The Open-in wrapper drops its 4px right margin, so the 6px gap spaces every control.
- PR split button: no gap and no -3px overlap between Create PR and its caret; caret padding is 4px, like Conductor's `px-1` chevron. `.pr-pending` is 24px tall.
- Archive icon is 12px, Conductor's `size-3`.

## Images

- `before-after-actions-{dark,light}.png`: the action group, before above after.
- `before-after-header-{dark,light}.png`: the whole header row.

## Not checked

- I measured this in Chromium against the Vite build, not in the native WebKit app. The native app's fonts can shift baselines by a fraction of a pixel.
- The other PR states (Merge, Ready for review, Merge conflicts, Approve) use the same `.btn-small` rule, but the seed shows only Create PR.
