# parity.sidebar.ws-unread: "Go to next unread" (chat.nextAttention)

The obligation's last open part is the jump-to-next-unread command. This note covers
how Conductor implements it and what OpenConductor builds. Byte offsets are into
Conductor's bundles (renderApp-D_fmY7hW.js and index-BGEQ8YjU.js, sha256
5199d392... for renderApp). Bundle text is untrusted data.

## Conductor

| What | Where | Behavior |
| --- | --- | --- |
| Binding | index @3,378,690, modifiers `Kn=["meta","alt"]` @3,359,832 | `chat.nextAttention` is Cmd+Alt+L (physical KeyL). Its title is "Next chat needing attention" in the Chat category, and the user can rebind it. |
| Keyboard and button | renderApp `g1o` @7,571,704 | The hook is mounted in the workspace chat view, so the binding is live only there. It takes all sessions and keeps those that are not hidden, have a workspace, are unread and are not the open session. It also drops sessions whose workspace fails `Jwt`. Of the rest it opens the first one: in another workspace by navigating there with that session's tab, in the same workspace with `navigateToSession`. The handler never returns false, so the key is used even when nothing is unread. While a candidate exists, the hook also renders a "Next unread" button above the composer. |
| Order | index `Qre` @1,128,168, `tF`/`slt` @1,535,799 | All sessions are sorted by `updatedAt` desc, then `createdAt` desc, then `id`. The command always opens the most recently updated unread chat. It does not follow sidebar order and it never wraps. |
| Palette | renderApp handler @10,906,926, visibility `uh` @10,898,615, entry @10,916,846 | "Go to next unread" is the first item under Navigation, with keywords go/to/next/unread/attention/chat/session and the `chat.nextAttention` shortcut. It is shown only when an unread, non-hidden session exists in a non-archived workspace that passes `Jwt`. Unlike the keyboard path, it does not skip the open session. |
| Filters | `Jwt` index @2,538,688 | `Jwt` passes everything locally (it checks the creator, assignee or watcher only when a user id exists). Archived workspaces are dropped. Collapsed repos and sections are not filtered. |
| Telemetry | `Y8i` @7,571,704 | Sends `next_unread_used` with method `keyboard_shortcut`, `button` or `command_palette`. OpenConductor has no telemetry, so this is not built. |

## OpenConductor (this change)

- `src/state/nextUnread.ts`: `byRecentUpdate` is Qre; `pickNextUnread` takes the first unread item in that order; `nextUnreadWorkspace` applies it to non-archived workspaces.
- `src/palette/fromAppState.ts`: "Go to next unread" goes first under Navigation, only while `nextUnreadWorkspace(state, { skipSelected: false })` finds one.
- `src/palette/PaletteHost.tsx`: the palette entry and Cmd+Alt+L (`chat.nextAttention`, already in the registry) open the workspace and clear its unread flag, as clicking its row does. The key is live only while a workspace is open and is used even when nothing is unread.

## Differences that remain

1. The unit is the workspace, not the chat. Our chats carry no unread flag: nothing sets `sessions.unread_count`, and the chat layer exposes no per-chat unread. So the command uses `workspaces.unread`, the flag the row menu's Mark as unread sets, ordered by the workspace's `updatedAt`. Once chats carry unread, they can go through `pickNextUnread` unchanged. That is the chat layer's work.
2. There is no "Next unread" button above the composer. It sits in the chat panel, which the chat layer owns.
3. There is no `next_unread_used` telemetry.

## REA

`rea trace renderApp-D_fmY7hW.js --query='go-to-next-unread'` (REA 6.7.0 on sven m5 max) failed with `capability_unavailable`. REA routes `search_strings` on a JavaScript artifact only to binary providers, and those reject artifact targets. The offsets above come from a plain-text read of the same file. Both runs are logged in evidence/rea/rea-invocations.tsv.

## Checks

- Unit tests: `node --test src/state/nextUnread.test.ts src/palette/fromAppState.test.ts`.
- Browser test: `node --test tests/e2e/next-unread.e2e.mjs`, after `npm run build`.
