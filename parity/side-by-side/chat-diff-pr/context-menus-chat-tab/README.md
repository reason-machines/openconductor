# Chat tab right-click menu: Conductor 0.87.6 `u8i` vs OpenConductor

Captured with REA 6.8.0 `capture-browser-scenario` (Conductor's extracted frontend in
`tools/screens`, OpenConductor's Vite build), compared with `compare-web-screenshots`
(`--channel-threshold 24`); `captures.json` has the evidence ids and ratios. Rerun:

```bash
npx vite build && (cd tools/screens && npm ci)
DIST=<conductor dist> TMPDIR=/tmp/t C_PORT=4687 O_PORT=4688 node tools/context-menus/chat-tab-capture.mjs
```

| Shot | What | Changed pixels (t24) |
| --- | --- | --- |
| `sbs-chat-tab--dark.png` | the workspace's only chat, after a turn | 6.1% |
| `sbs-chat-tab-fork--dark.png` | Experimental › Fork chat to new tab on | 6.2% |
| `sbs-chat-tab-two-chats--dark.png` | right-click on the first of two chats | 4.1% |

The remaining pixels are the windows behind the menu (Conductor's seeded transcript vs our
demo chat, tab titles), not the menu.

## Menu (renderApp-D_fmY7hW.js `u8i`, read as data)

| Conductor | OpenConductor | Status |
| --- | --- | --- |
| Mark as read / Mark as unread | same, writes `sessions.unread_count` (main, kept) | match |
| Rename chat (only when `canRename`) | shown, disabled | gap: chats have no rename yet, #523 |
| Fork to new tab `⌘⌥` + corner-down-left glyph (Experimental › Fork chat to new tab, not archived; disabled while forking) | same; forks the whole chat into a new tab on the chat's options | match |
| separator | separator | match |
| Copy concise transcript `⌘⌥C` | same; Conductor's concise form (fork transcript) | match |
| Copy full transcript | same; Conductor's complete form (`VOt` with `complete`) | match |
| Copy link | same; `openconductor://workspace?id=<ws>&session=<chat>` | match |
| separator + Copy session info | not offered | internal builds only in Conductor |
| separator, Close tab `⌘W`, Close others (only with `showClose`: writable and several chats or a user message) | same section rule | match |
| Close tab | enabled on review/fork/new chats; disabled on the workspace's own chat | gap: the workspace chat cannot close yet, #524 |
| Close others (disabled with one chat) | same; closes the other closable chats (they go on the ⌘⇧T stack) | match, except the workspace chat stays open (#524) |

No icons, `min-w-[200px]`, items from the shared menu (`src/components/menu/ContextMenu.tsx`).
Hints follow the keybinding registry and the user's overrides (`chat.forkToNewTab`,
`chat.copyTextConcise`, `nav.closeTab`); Conductor hard-codes them.

## REA gaps hit

- `rea search` refuses JavaScript targets, so `u8i`, `lco`, `gf` and the transcript
  builder were read from the bundle as plain text (known gap).
- `capture-browser-scenario` reports a locator that matches nothing only as
  "Analysis operation timed out after 15000ms" (Conductor's "+" has no `aria-label`;
  the two-chats shot opens its second chat with ⌘T instead).
- No element positions in the result, so the crop is fixed by hand (known gap #38).
