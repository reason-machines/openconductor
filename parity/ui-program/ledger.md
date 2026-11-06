# UI program ledger: OpenConductor vs Conductor, screen by screen

One row per node of Sven's UI audit program. A node is done when its side-by-side image
(real Conductor left, OpenConductor right, same window size; rules in
[side-by-side/README.md](../side-by-side/README.md)) shows it matching, and that image is linked
from a merged PR.

The coordinator Session owns this file. Builder Sessions update their own row in the PR that
changes the node: owner Session id, PR numbers, status and the date of the side-by-side image
that justifies the status.

## Columns

- **Node**: the screen area. The slug in backticks is the `<node>` part of image file names.
- **Owner Session**: the child Session building the node (Session id), or `unassigned`.
- **PRs**: PRs for the node, newest last (`#123`, draft or merged).
- **Side-by-side status**: one of
  - `missing`: OpenConductor has no equivalent screen or control;
  - `wrong`: OpenConductor has it but it does not match Conductor;
  - `matches`: the latest side-by-side image shows no difference Sven would call out.
- **Last verified**: date and OpenConductor commit of the side-by-side image behind the status,
  linked to the image. `seed` means no side-by-side exists yet (see Seed below).

## Nodes

| Node | Owner Session | PRs | Side-by-side status | Last verified |
|---|---|---|---|---|
| Home `home` | unassigned | | wrong | seed |
| Sidebar `sidebar` | unassigned | | wrong | seed |
| Header + title bar `header` | unassigned | | wrong | seed |
| Chat tabs + chat area + composer `chat` | unassigned | | wrong | seed |
| Right panel: All files / Changes / Checks `right-panel` | unassigned | | wrong | seed |
| Setup / Run / Terminal strip `strip` | unassigned | | wrong | seed |
| Settings: Personal (General, Account, Appearance, Default models, Git, Ports) `settings-personal` | unassigned | | wrong | seed |
| Settings: Agents & environment (Agents, Environment) `settings-agents-env` | unassigned | | wrong | seed |
| Settings: Repositories (per repo: Environment, Git, Scripts, Actions, Misc) `settings-repos` | unassigned | | wrong | seed |
| Settings: More (Experimental, Advanced) `settings-more` | unassigned | | wrong | seed |
| Settings: Organization and Cloud (cloud org only) `settings-org` | unassigned | | missing | seed |
| Dialogs and menus `dialogs-menus` | unassigned | | wrong | seed |
| Toasts `toasts` | unassigned | | wrong | seed |

Settings groups follow Conductor's settings navigation as read from its bundle
([evidence/settings/NOTES.md](../../evidence/settings/NOTES.md), "Settings pages"): Personal,
Agents & environment, Repositories, More. Conductor shows Ports and the Organization/Cloud pages
only for a cloud organization and redirects a local user to General; whether OpenConductor builds
them is the coordinator's call.

## What each node covers

Scope comes from Sven's decisions for the program; anything not listed is matched to Conductor
as-is.

- **Home**: Conductor's Home with the pixel wordmark in our name, three cards and the cities line;
  the sidebar's Home entry opens it.
- **Sidebar**: repo avatars, workspace rows with branch icons, `+N −M` counts, the FREE badge;
  the sidebar header is part of the window drag region.
- **Header + title bar**: breadcrumb `repo › branch ···` (repo avatar, chevron separator, overflow
  menu), the Open in button and its menu, the right-panel toggle at the far right; a drag region
  along the whole top (`data-tauri-drag-region` on the title-bar strip, sidebar header and main
  header, never on buttons).
- **Chat tabs + chat area + composer**: a tab per chat above the chat, a `+` with tooltip
  "New chat, same files ⌘T" and the ⌘T shortcut, several chats per workspace; transcript and
  composer as in Conductor.
- **Right panel**: tabs "All files", "Changes" with count badge, "Checks"; toolbar icons on the
  right (collapse tree, search, new file). File tree with folder and file-type icons, hover row
  highlight, expand chevron on hover, monospace names; files open through Open in, no in-app
  editor.
- **Setup / Run / Terminal strip**: collapsible strip under the right panel with tabs Setup, Run,
  Terminal, a `+` and a collapse chevron. Run's empty state is a dashed box "Run tests or a
  development server to test changes in this workspace" with an "Add run script" button. The
  bottom-of-workspace terminal stays removed; the terminal is a tab here.
- **Settings**: one node per page group above.
- **Dialogs and menus**: every dialog, sheet, context menu, popover and select (create project,
  clone, rename, keyboard shortcuts, account, workspace context, repo actions, model picker, help,
  command palette, Open in menu).
- **Toasts**: sonner toasts, their copy, placement and actions.
- **Across all nodes**: no blue accent. Active tab underlines, selected states, buttons (Run
  included), links, focus rings and the Open in icon tint are neutral black/grey, set once in the
  theme tokens, never per component.

## Seed

No side-by-side image exists yet, so every status above is a seed from
[parity/ui-map.md](../ui-map.md) (generated 2026-11-05 against OpenConductor `2e13137`) and Sven's
decisions. Those ui-map references are Conductor's extracted frontend rendered in Chromium on
Linux, not the native macOS app, and several PRs merged since (#471 file tree, #477 tool rows,
#481 terminal strip), so a seed status is a starting point, not a verification. The first
side-by-side image for a node replaces its seed.

| Node | Seed basis |
|---|---|
| `home` | ui-map `home` wrong (copy 79%); `home-empty` matches, but the wordmark, cards and cities line are Sven's open asks |
| `sidebar` | ui-map `sidebar-after-archive` matches, but repo avatars, branch icons, `+N −M` and FREE badge are Sven's open asks |
| `header` | Sven's asks (breadcrumb, Open in, panel toggle, drag region); no ui-map state isolates the header |
| `chat` | ui-map `workspace-chat`, `workspace-new-chat`, `workspace-tool-calls` wrong; chat tabs partial per the 2026-11-05 parity re-review |
| `right-panel` | ui-map `diff-*` wrong; Sven's asks for tabs, toolbar and tree |
| `strip` | Sven's asks (Setup/Run/Terminal tabs, Run empty state, Run button not blue) |
| `settings-personal` | ui-map General, Account, Default models, Appearance wrong; Git matches; Ports missing |
| `settings-agents-env` | ui-map Agents, Environment wrong |
| `settings-repos` | ui-map repo Environment, Scripts, Actions, Misc wrong; repo Git matches |
| `settings-more` | ui-map Experimental, Advanced wrong |
| `settings-org` | ui-map: OpenConductor has no organization or cloud settings |
| `dialogs-menus` | ui-map dialog and menu states all wrong; 56 of 64 dialogs and 39 of 39 menus missing in the inventory |
| `toasts` | ui-map `toast-copied-link` wrong; 326 of 327 inventory toasts missing |

## Native references

Real-app captures from Sven's Mac belong under `evidence/screens/native/`. As of this file's first
commit that directory does not exist; the only Conductor references in the repo are the
Chromium harness renders in [evidence/screens](../../evidence/screens) and
[parity/ui-map](../ui-map). Side-by-side images need the native app on the left (see the
side-by-side README).
