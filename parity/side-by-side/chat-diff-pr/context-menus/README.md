# Right-click menus on the chat, diff and PR screens

Conductor 0.87.6 builds every right-click menu with Base UI's `ContextMenu`
(renderApp-D_fmY7hW.js: `kS` root, `A6` trigger, `gy` content, `L1` item,
`aye` separator, `J4` shortcut, `TFt`/`AFt` submenu). Every place it mounts `gy`
was listed from the bundle and resolved to its owner element; strings and code
were read as untrusted data. OpenConductor's equivalent is
[src/components/ContextMenu.tsx](../../../../src/components/ContextMenu.tsx).

## Shared menu look and motion (from `gy` / `L1` / `aye` / `J4` / `TFt` / `AFt` classes)

| Property | Conductor | OpenConductor |
| --- | --- | --- |
| Popup | `min-w-32 p-1 rounded-lg ring-1 ring-popover-ring bg-popover shadow-md` | `.cm`: 128px min, 4px padding, 8px radius, 1px ring, shadow-md |
| Placement | side right, sideOffset 2, align start, flip/shift in window | `placeMenu` (unit-tested) |
| Open/close | `transition-[opacity,scale] duration-100`, starting/ending style `opacity-0 scale-95`, origin at the pointer corner | same, `data-starting-style` / `data-ending-style` |
| Item | `gap-2 rounded-md px-2 py-1.5 text-sm`, icons `size-4` muted | `.cm-item` |
| Hover / keyboard highlight | `data-[highlighted]:bg-popover-accent text-accent-foreground` | same tokens |
| Disabled | `opacity-50 pointer-events-none` | same |
| Separator | `-mx-1 my-1 h-px bg-border` | `.cm-sep` |
| Shortcut | `ml-auto pl-4 text-xs tracking-widest text-muted-foreground` | `.cm-shortcut` |
| Submenu | trigger `rounded-sm` + chevron-right; popup `rounded-md border shadow-lg`, sideOffset 0 | `SubMenu` |
| Icons | lucide, CSS `.lucide{stroke-width:1px}` non-scaling | 1px non-scaling stroke |

## Menu inventory (Conductor menu -> our element -> status)

Every `gy` (ContextMenuContent) mount in renderApp, resolved to its owner. The
ui-map ids are `menu:<owner>`; most are unnamed in the map.

| Conductor menu (owner) | Where | Items in order (icons, shortcuts, states) | OpenConductor element | Status |
| --- | --- | --- | --- | --- |
| `menu:u8i` | Chat tab | Mark as read / Mark as unread; Rename chat (when renamable); Fork to new tab ⌘⌥↵ (Experimental setting on, not archived); ─; Copy concise transcript ⌘⌥C; Copy full transcript; Copy link; (─ Copy session info: internal builds only); ─ Close tab ⌘W, Close others (disabled with one chat). No icons, `min-w-[200px]` | [ChatTabMenu.tsx](../../../../src/features/chat/ChatTabMenu.tsx) on every chat tab (workspace chat and review/fork chats) | items, order, separators, shortcuts and width match. Copy concise/full transcript (Conductor's `VOt` formats, [transcriptCopy.ts](../../../../src/features/chat/transcriptCopy.ts)), Copy link (`openconductor://workspace?id=..&session=..`), Fork to new tab, Close tab (review/fork chats), Close others and ⌘⌥C work. Disabled until their backends exist: Mark as read/unread (PR #456 adds per-chat unread), Rename chat (chats have no rename), Close tab on the workspace's own chat (it cannot be closed yet) |
| `menu:svs` via `syi` | Changes list row | View (eye); Attach in chat (plus) only where the caller passes `onAttach`, which `syi` does not; Open in ▸ (arrow-up-right; installed apps with `supportsFileOpen`, number keys 1-9); Copy path (copy); Copy relative path (copy); ─; Discard changes (undo-2) | [FileContextMenu.tsx](../../../../src/features/diff/FileContextMenu.tsx) | match; toasts "Copied path to clipboard" / "Copied relative path to clipboard" |
| `menu:u6s` | Right panel Review button | Edit before sending (disabled in a read-only workspace) | [ReviewButton.tsx](../../../../src/features/diff/ReviewButton.tsx) | match (the ui-map files this under "queued message"; it is the Review button's menu) |
| `RFt` -> `w_i` | Header PR pill | Open in <PR open target> (arrow-up-right) ⌘⇧G; Open in each other target (github.com PRs); Copy link (copy); Copy number (hash). `min-w-[180px]` | [PrLinkMenu.tsx](../../../../src/features/pr/PrLinkMenu.tsx) on `PrControl`'s PR link and status buttons | match; target URLs from Conductor's `fds` ([prLinkMenuItems.ts](../../../../src/features/pr/prLinkMenuItems.ts), tested) |
| `sKo` -> `w_i` | PR tab title "#N" | same as above | `PrHeader`'s "#N" | match |
| `EQ` via `cEi` | Links in chat markdown | Web link: Copy link address (copy). Workspace file link: Open in Finder (folder-open), Copy file path (copy) | [LinkMenu.tsx](../../../../src/features/chat/LinkMenu.tsx) on markdown links in assistant text | web-link form only (our markdown has no href file links); copies without Conductor's "Copied address to clipboard" toast (no toast channel reaches the transcript); not captured on screen, neither fixture set has a link |
| `gwt` | Image/file attachment previews | Open in ▸, Download, Copy file path | composer/transcript attachments | not done in this PR |
| turn "…" More actions | Turn footer | a click dropdown (`Tm`, DropdownMenuContent), not a right-click menu | — | outside this check |
| diff viewer file headers, Checks rows, header breadcrumb | — | Conductor mounts no context menu there | — | match (none) |
| `Svs` via `Bvs`, `Plo`, `e9a`/`t9a`, `zOo`, `Lna`, `gJn`, `h0a`, `bro`, `S_i` | File tree, W-N chip, settings nav, members, Roundhouse, stack | — | other screen owners | out of scope |

## Captures

`tools/context-menus/capture.mjs` opens each menu with REA
`capture-browser-scenario` (right-click step) in Conductor's extracted frontend
(tools/screens harness, `populated` fixtures) and in OpenConductor's Vite build,
records REA `compare-web-screenshots` (channel threshold 24) and renders the
side-by-side crop through REA. Hashes and evidence ids: [captures.json](captures.json).

![Changes row menu](sbs-diff-file-row--dark.png)
![Chat tab menu](sbs-chat-tab--dark.png)
![Review button menu](sbs-review-button--dark.png)
![PR pill menu (no Conductor reference: the harness has no PR fixture)](sbs-pr-pill--dark.png)

## REA gaps and harness issues hit

- `rea capture-browser-scenario --schema` prints only `{inputJson: string}`; the action
  schema (for example `click` with `button: "right"`) had to be read from REA's
  bundled zod schema in `rea-agents/dist/cli-runtime/browserScenarioValues-*.js`.
- With the session's long `TMPDIR`, capture-browser-scenario fails with a generic
  `execution_failure` ("run rea doctor") and no step detail; `TMPDIR=/tmp/t` works.
- A failed action step returns a normal envelope without a screenshot; only the
  per-step `error` says why (for example a 5 s click timeout while the page boots).
- No REA view addresses a minified function by name; menus were sliced from the
  bundle by name with a small brace matcher and formatted with prettier.
- Harness: Conductor's extracted dist ships no Geist font files, so reference
  captures fall back to a system font unless the capture overlays them (done here
  with OpenConductor's byte-identical files, without touching the shared dist).
- Harness: `tools/screens` needs `npm ci` there (sql.js) before server.mjs serves.
