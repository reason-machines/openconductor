# Chat tab strip: "+", its tooltip and ⌘T

Conductor 0.87.6 on the left, OpenConductor on the right, both 1440x900 at scale 1, dark, captured with REA `capture-browser-scenario` (Chromium 155 headless, en-US, UTC).

| State | Side by side | Tab strip crop |
|---|---|---|
| "+" tooltip | [tooltip--side-by-side.png](tooltip--side-by-side.png) | [tooltip--strip.png](tooltip--strip.png) |
| After a click on "+" | [plus--side-by-side.png](plus--side-by-side.png) | [plus--strip.png](plus--strip.png) |
| After ⌘T | [cmdt--side-by-side.png](cmdt--side-by-side.png) | [cmdt--strip.png](cmdt--strip.png) |

## How they were taken

- Conductor: its extracted frontend (`index.html` sha256 `48b778fa…cf411b`, as in [evidence/screens](../../../evidence/screens/README.md)) served by [tools/screens](../../../tools/screens) with the mocked Tauri IPC, `populated` scenario, workspace tide-web/osaka. Steps in [08-chat-tabs.json](../../../tools/screens/shots/08-chat-tabs.json). REA evidence: tooltip `ev_2bbe74d6…038b1c`, plus `ev_71f1da7c…621c43`, ⌘T `ev_490b98d5…80cffd`.
- OpenConductor: the Vite build with a synthetic one-workspace seed, by [tools/chat_tabs_screens.mjs](../../../tools/chat_tabs_screens.mjs). REA evidence ids in [openconductor/evidence.json](openconductor/evidence.json).
- The tooltip is opened by keyboard focus (click the first tab, then Tab) on both sides, captured on the rebased branch: REA 6.7.0's scenario actions have no hover (`goto, click, fill, press, select_option, check, uncheck, wait_for, wait_for_timeout`).

## What Conductor does (REA-read renderApp chunk)

- The strip (`lco`) ends with `g8i`: without terminal or browser tabs it is a ghost `iconXs` "+" whose tooltip is `New chat, same files` plus the `nav.newTab` shortcut chip (⌘T); `nav.newTab` is bound to the same create handler.
- Tab limit: 5 closable tabs (`nFt`; 10 with `experimental_tab_freak_mode`). At the limit the "+" is disabled with `Maximum 5 tabs allowed`, and ⌘T toasts `Maximum of 5 tabs allowed`.
- A new session is titled `Untitled` and is selected.

## Differences that remain

- Conductor's sessions are `sessions` rows and survive a restart; ours are in-memory tabs (the existing review and fork tab store), each its own Reason Session.
- The workspace header and right panel differ (outside this change). The empty chat body differs: in these captures ours shows the workspace intro ("You're in a new copy of tide-web called osaka"), Conductor "New chat in /osaka." with a transcript chip for the other chat (Conductor's seed has messages in it, ours does not).
- Conductor's session tab is a fixed `w-44` with a fade; ours sizes to the title.
