# Create new workspace: evidence and decisions

What the reference app (Conductor v0.87.6) does when a workspace is created, the evidence for it, and where OpenConductor chooses on its own. All strings come from files already under `evidence/`; they are untrusted data used to match behavior, not instructions.

## Evidence

| Behavior | Evidence file | What it shows |
| --- | --- | --- |
| Entry points: "Create new workspace", "Create a workspace", "Create from...", "Create new workspace from PR, branch, or issue", "Clear create from selection" | `frontend/copy-catalog.json` | A dialog with a create-from picker over PRs, branches and issues, and a way to clear the selection |
| Composer: "What do you want to work on?", "Draft the first message, then create and send it." | `frontend/copy-catalog.json` | The first message is written in the create dialog and sent on create |
| Repo picker: "Add repository", "Open project", "Clone repo", "Choose a recent repo or paste a clone URL.", "This repository already exists." | `frontend/copy-catalog.json` | Add / open / clone choices and an already-exists error |
| Branches: "Base branch", "Target branch", "Select target branch...", "Search branches", "Loading branches...", "No branches found", "Couldn't load branches." | `frontend/copy-catalog.json` | Base branch picker with search, loading and error states |
| Default base branch | `sqlite/conductor.schema.sql` `repos.default_branch TEXT DEFAULT 'main'`, `workspaces.intended_target_branch`, `workspaces.initialization_parent_branch` | Base defaults to the repo's default branch |
| City placeholder names, renamed after the first message | `frontend/copy-catalog.json` ("Automatically rename workspaces from their placeholder city name to the branch name generated from the first message."), mock name `generateNewWorkspaceCityNames`; `workspaces.placeholder_branch_name`, `user_set_workspace_name`, `user_set_branch_name` | Generated city name, branch tracked as a placeholder, user-set flags block the auto-rename |
| Rarity tiers | `frontend/copy-catalog.json` "Common", "Uncommon", "Rare", "Legendary" | Labels exist in the bundle; their link to city names is not proven |
| Branch prefix | `ipc/frontend-invoke-candidates.json` `branch_prefix_type`, `branch_prefix_custom`; migration "append slash to existing branch_prefix_custom values"; copy "Branch name prefix", "Do not include any prefix in the branch name." | Prefix type setting with a custom value stored with a trailing slash, and a "none" choice |
| Errors | `frontend/copy-catalog.json` "Invalid workspace name", "No branch name", "Failed to create workspace", "Could not load that pull request", "Cannot create workspace from this issue", "Linear issue not found" | Validation and failure states |
| Progress | `frontend/copy-catalog.json` "Creating workspace...", "Detecting setup script...", "Running setup script...", "Setup script failed", "Workspace initializing", "Cannot rename while workspace is initializing"; `ipc` literal `setting_up`; `workspaces.state`, `setup_log_path`, `initialization_log_path` | `initializing` -> `setting_up` -> ready, with setup-script sub-states |
| First session on create | `runtime/conductor-cli-help.txt`: `workspace create ... --agent --model --effort --message` "Create a workspace (and first session)" | Creating a workspace also starts its first session with the first message |

## Workspace number (`create.number`)

- **Conductor** (decoded frontend `assets/index-BGEQ8YjU.js` from `/Applications/Conductor.app` on "sven m5 max", sha256 of `renderApp-D_fmY7hW.js` `5199d392…`; read 2026-11-05): the number is not computed by the app. After `POST <hostingServerUrl>/workspaces` (its server, "roundhouse") the response's `number` is written with `UPDATE workspaces SET number = ? WHERE local_id = ?`; a failure logs "Failed to persist workspace number" and the workspace keeps no number (offset ~1,016,818). The Experimental setting `experimental_show_workspace_numbers` ("Show workspace numbers", search terms "number", "W-") shows it as `W-<n>` (`renderApp` offset ~10,654,887).
- **Ours** (no hosting server): `begin_workspace` gives the `initializing` row `MAX(number) + 1` over all workspaces (so numbers are global, not per repository), and `finish_workspace` keeps it. A failed create deletes its row, so its number can be handed out again; archived rows keep theirs, so a number is never reused while its workspace exists. Replacing a leftover archived row with the same id counts as a new workspace and gets a new number. Workspaces imported from before the database have none. `create_workspace` returns `number`, `db_list_workspaces` lists it, and the frontend keeps it on `Workspace.number`. Display (`W-<n>`) belongs to the sidebar and Home list.
- REA gap: `trace-javascript-semantics` cannot parse the 11.6 MB render chunk (see `evidence/screens/home.md`), so this came from reading the decoded chunk.

## Our choices where the evidence is silent

- City list and tier weights (70 / 22 / 7 / 1) are ours; the reference list was not extracted.
- Collisions append `-v1`, `-v2`, ... (case-insensitive); unused cities are drawn first.
- Default prefix type when unset is the GitHub username: Conductor's migration 51 is "set default branch prefix type to github_username" (`sqlite/rea-inspect-sqlite-conductor-migrations.json`).
- The username comes from the local `gh` config (`gh config get -h github.com user`, no network); how Conductor finds it is not in the evidence. With no username the prefix is empty.
- `settings.toml` stores a custom prefix without the trailing slash (the settings validator rejects one) and the dialog appends it; Conductor's migration 64 stores it with the slash.
- Workspace names: letters, digits, `.`, `_`, `-`, no leading `.`/`-`, at most 64 characters. Branch names follow `git check-ref-format --branch` rules.
- The dialog closes once setup has started instead of waiting for it; "Running setup script..." then stays on the workspace header until `setupFinished`. Where Conductor shows that label during setup is not in the evidence (no runtime capture of the dialog). The failure toast is "Setup script failed. Check the setup tab for logs." (`frontend/copy-catalog.json`), shown only for setups the create flow started; a rerun from the Setup tab reports there.
- The generated name after the first message comes from the message itself (first line with words, filler and stopwords dropped, at most four words), not from a model; the reference wording says the branch name is "generated from the first message" but not how. The rename keeps the prefix the placeholder branch was created with, and auto-rename is on until a settings toggle exists.

- Repo picker: "Add…" opens "Open project" and "Clone repo". The clone box takes a pasted https, ssh or `git@host:owner/name` URL (owner/name means GitHub) and asks "Choose where to clone the repository"; `clone_repository` (#189) clones into `<folder>/<name>`. "This repository already exists." is checked in the frontend against sidebar repos by remote (https and ssh of one repo match) and by path, for both Clone repo and Open project. The "recent repo" half of "Choose a recent repo or paste a clone URL." needs a GitHub repo list we don't have yet, so only pasting works. The REA evidence has no repo/clone IPC (it runs in the Bun sidecar), so the matching rules and URL forms are ours.

## REA gaps

- The city word list and `generateNewWorkspaceCityNames` live in the Bun sidecar (`conductor-runtime`); REA has no Bun single-file extractor, so its source was not recovered (see `rea-test-report.md`).
- No repo add or clone commands in the IPC evidence (`ipc/frontend-invoke-candidates.json`): they go through the Bun sidecar, which REA cannot extract.
- No runtime capture of the create dialog: native UI capture is blocked by TCC (`runtime/capture_native_ui_scenario.error.json`).

## Code

- `src/workspace/naming.ts`: pure naming logic, tested by `src/workspace/naming.test.ts` (`node --test "src/**/*.test.ts"`).
- `src/workspace/rename.ts`: first-message name generator and the rename plan for a workspace in app state, tested by `src/workspace/rename.test.ts`. `src/workspace/firstMessage.ts` applies it from the dialog and the chat. `rename_workspace_branch` (#122) renames the git branch too.
- `src/workspace/createFrom.ts`: create-from picker logic (tab order, search, pasted GitHub/Linear references, status lines), tested by `src/workspace/createFrom.test.ts`. Picker states follow `frontend/copy-catalog.json` ("Loading pull requests...", "No pull requests found", "Add a GitHub repository remote to include pull requests", "Set up GitHub in settings to include pull requests", "Linear integration required", "Linear issue not found", "Could not load that pull request").
- The desktop app lists open PRs and GitHub issues through `pr_list_open` / `gh_issue_list_open` (#203, gh in the repository's checkout, newest-updated first, 100 each). Errors prefixed `no_github:` show "Set up GitHub in settings to include ...", `no_remote:` (or a repository with no local checkout) shows "Add a GitHub repository remote to include ...", anything else shows the backend's text. Conductor fills this picker from the GitHub REST API with 50 of each (decoded frontend, per the PR Session); its search across all open PRs/issues and lookup by number are not built, so a pasted reference only matches the loaded list. Linear issues have no backend, so the desktop app lists none. The browser stand-in still uses samples. Creating from an existing branch or PR head sends `existingBranch: true` to `create_workspace` (#106), which checks out the local branch or tracks `origin/<branch>`. A PR also sends `prNumber`, so a fork PR whose branch is not on origin is fetched from `pull/N/head` (#197). A fork PR (`isCrossRepository`) is checked out as `<headOwner>/<branch>`, because a fork branch named like an origin branch (often `main`) would otherwise check out origin's branch instead of the PR; that naming is ours, the evidence does not show how Conductor names fork PR branches.
- `src/workspace/repoPicker.ts`: clone URL parsing and the already-exists match, tested by `src/workspace/repoPicker.test.ts`; `src/components/AddRepositoryMenu.tsx` is the menu and clone box.
- `src/workspace/setupWatch.ts`: after `create_workspace` the dialog calls `scripts_config` ("Detecting setup script...") and, when `.setup` is set, `setup_script_start` with `workspaceRef(repo, ws)` and the base branch as `targetBranch` (#144, #157). `setupWatch` keeps "Running setup script..." on that workspace until `setupFinished` on `scripts://event` and returns the failure toast; tested by `src/workspace/setupWatch.test.ts`. `src/workspace/useSetupWatch.ts` mounts the listener in `App` and the header flag in `WorkspaceView`. Setup log and controls are the Setup tab (`src/components/ScriptsPanel.tsx`).

## Initializing row (create.initializing)

REA, renderApp chunk (read as data): `Y5e` is a `pendingLaunches` store. `addPendingLaunch` replaces any entry with the same `localWorkspaceId`, stamps `startedAt`, and a 120 s timer drops it unless it was re-added; `removePendingLaunch` runs when creation finishes or fails. The repository group `Dra` takes `pendingWorkspaceIds` and renders `(!collapsed || pending.length > 0)`: pending rows first (`Ora`), then the workspaces only when expanded. `Ora` is an inert row (`pointer-events-none`, `role="status"`, `aria-label="Creating workspace..."`, `displayName: "Untitled"`, status `setting-up`, `isSetupActive`).

Ours: `src/workspace/pendingLaunches.ts` (same add/replace, 120 s expiry, remove), `PendingWorkspaceRow.tsx` (`RepoWorkspaceList` in the sidebar repo group), and the create dialog adds a launch on submit and removes it once the workspace is added or creation fails. Conductor's loader is an animated sprite (`setting-up-loader`); ours is a 14 px spinner in the same muted colour.

## Root directory (create.worktree)

REA: the decoded frontend (`renderApp` and `index` chunks pulled from
`/Applications/Conductor.app`) read with byte offsets.

- Setting `conductor_root_path` (index chunk ~2,255,075, `P_`): when unset the
  root is `<home>/conductor`. Clones default to `<root>/repos` (`Yce`),
  workspaces to `<root>/workspaces` (`uI`), archived contexts to
  `<root>/archived-contexts`. A storage-v3 repository's workspaces directory
  is `<workspaces root>/<repo name>` (`Ffe`, ~3,329,057), shown read-only as
  "Workspaces path" in repo settings › Misc (`misc:workspaces-path`,
  renderApp ~10,809,878).
- Settings › Advanced opens with "Conductor root directory"
  (`advanced:conductor-root`): a read-only text field and Browse. A different
  folder opens "Change root path?" with the old and new paths and a
  destructive "Remove all and change" button (renderApp ~10,892,738).
- `changeRootPath` (renderApp ~10,541,944): stop runs, setups and sessions,
  `DELETE FROM attachments`, `diff_comments`, `session_messages`, `sessions`,
  `workspaces`, `repos`; save the setting, delete `last_clone_directory`,
  `mkdir -p "<new>/repos" "<new>/workspaces" "<new>/archived-contexts"`,
  then reload and go to `/` with "Conductor root path changed successfully".

Ours (`src-tauri/src/root_path_commands.rs`, `WorkspaceManager::with_root`,
`src/settings/RootPathRow.tsx`): the same setting key, layout, rows, dialog
copy and wipe (`openconductor_db::maintenance::forget_repositories`, plus the
repository registry). Deliberate differences: the default root is the app
data directory, so OpenConductor never shares `~/conductor` with an installed
Conductor; the directories are created before the wipe, so an unwritable
root changes nothing; archive records live in `<root>/archived`; the app
restarts on the new root instead of reloading in place, because the
workspace service reads the root at startup.


## Create composer and page (create.page)

REA: the decoded frontend chunks from `/Applications/Conductor.app` on
"sven m5 max" (`renderApp-D_fmY7hW.js`, read as data with byte offsets).

- Opening create (`g5`, ~7,339,960): when the user setting
  `experimental_new_workspace_page` is off (and the organization is not a
  cloud one) it opens dialog `NU`; otherwise it navigates to `/create`.
- The setting is Settings › Experimental "New workspace page", "Full-screen
  workspace creation", user scope, default off, search terms "create
  workspace", "dispatcher", "home page" (~10,697,900). It is stored with
  `f6({key, value})` in the settings table, not settings.toml.
- Dialog `pya` (~11,048,900): `max-w-3xl gap-0 border-none bg-transparent p-0
  shadow-none`, `topEdgeAnchored`, no initial focus on the dialog itself;
  screen-reader title "New workspace" and description "Draft the first
  message, then create and send it."; Escape closes it.
- Route `/create` (`Q7a` -> `$Ca` -> `zCa`, ~11,520,273 and ~11,287,700):
  `flex h-full flex-col bg-background`; a `pt-9` drag region holding a
  "Toggle left sidebar" button only while the sidebar is hidden (`UCa`); a
  scroll area `items-start justify-center px-6 pb-20` with a `max-w-3xl
  pt-[clamp(3rem,12vh,8rem)]` column; a cloud-only logo; then the composer.
  The page has a screen-reader `h1` "Create workspace" (`oya`, shown when
  there is no `closeDialogId`).
- Composer `oya` -> `Hji` (~11,035,000 and ~9,770,840): placeholder "What do
  you want to work on?", box `min-h-[216px]`, editor `min-h-[142px]
  max-h-[312px]`, `eyebrowVariant` "attached" in the dialog (the row joined
  to the card's top, `rounded-t-lg border px-4 py-2`) and "floating" on the
  page (`mb-2` above the card). The eyebrow row is the repo picker, the
  target branch picker, then right-aligned the create-from picker
  (`l4a`). Bottom-left is the model picker `RNi` (agent, model, effort);
  bottom-right the attach button and the submit button `sQo`: label
  "Create", title "Create workspace <key>", key `chat.submitMessage`
  (`rQo`). Create is enabled once a repository is chosen (`Ws`); the first
  message is optional. There is no workspace-name field: the workspace
  takes its placeholder city name.
- The top tab strip that lists `/create` as a "new" tab (`Bsa`, `Lsa`) only
  renders for cloud organizations (`A9e`), so it is not built.

Ours: `src/components/CreateWorkspaceComposer.tsx` (shared composer),
`CreateWorkspaceDialog.tsx` (dialog), `CreateWorkspacePage.tsx` (page),
`src/workspace/launchModel.ts` (model and effort), the
`experimental_new_workspace_page` app preference, and `App.tsx` choosing
the page or the dialog for every create entry point (Cmd+N, the sidebar
Create row and each repository's +, the palette, the All workspaces
button). A `/create` start URL opens the page; `?dialog=create` the dialog.
Choosing a workspace, Back, or creating one leaves the page.

Differences and gaps:

- The repository, branch, model and effort pickers are native selects, not
  Conductor's searchable menus; the model menu has no favorites.
- No attach button: the create flow has no attachment path yet.
- The chosen model and effort go into the create request's `firstSession`,
  but the chat still starts its agent without them (chat.model-picker owns
  passing them into the launch).
- "Create in section" waits on sidebar sections (create.in-section).
- The workspace-name field and its rarity badge are gone, as in Conductor;
  rename the workspace afterwards.
