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

## Our choices where the evidence is silent

- City list and tier weights (70 / 22 / 7 / 1) are ours; the reference list was not extracted.
- Collisions append `-v1`, `-v2`, ... (case-insensitive); unused cities are drawn first.
- Default prefix type when unset is the GitHub username: Conductor's migration 51 is "set default branch prefix type to github_username" (`sqlite/rea-inspect-sqlite-conductor-migrations.json`).
- The username comes from the local `gh` config (`gh config get -h github.com user`, no network); how Conductor finds it is not in the evidence. With no username the prefix is empty.
- `settings.toml` stores a custom prefix without the trailing slash (the settings validator rejects one) and the dialog appends it; Conductor's migration 64 stores it with the slash.
- Workspace names: letters, digits, `.`, `_`, `-`, no leading `.`/`-`, at most 64 characters. Branch names follow `git check-ref-format --branch` rules.
- The dialog closes once setup has started instead of waiting for it; "Running setup script..." then stays on the workspace header until `setupFinished`. Where Conductor shows that label during setup is not in the evidence (no runtime capture of the dialog). The failure toast is "Setup script failed. Check the setup tab for logs." (`frontend/copy-catalog.json`), shown only for setups the create flow started; a rerun from the Setup tab reports there.
- The generated name after the first message comes from the message itself (first line with words, filler and stopwords dropped, at most four words), not from a model; the reference wording says the branch name is "generated from the first message" but not how. The rename keeps the prefix the placeholder branch was created with, and auto-rename is on until a settings toggle exists.

## REA gaps

- The city word list and `generateNewWorkspaceCityNames` live in the Bun sidecar (`conductor-runtime`); REA has no Bun single-file extractor, so its source was not recovered (see `rea-test-report.md`).
- No runtime capture of the create dialog: native UI capture is blocked by TCC (`runtime/capture_native_ui_scenario.error.json`).

## Code

- `src/workspace/naming.ts`: pure naming logic, tested by `src/workspace/naming.test.ts` (`node --test "src/**/*.test.ts"`).
- `src/workspace/rename.ts`: first-message name generator and the rename plan for a workspace in app state, tested by `src/workspace/rename.test.ts`. `src/workspace/firstMessage.ts` applies it from the dialog and the chat. `rename_workspace_branch` (#122) renames the git branch too.
- `src/workspace/createFrom.ts`: create-from picker logic (tab order, search, pasted GitHub/Linear references, status lines), tested by `src/workspace/createFrom.test.ts`. Picker states follow `frontend/copy-catalog.json` ("Loading pull requests...", "No pull requests found", "Add a GitHub repository remote to include pull requests", "Set up GitHub in settings to include pull requests", "Linear integration required", "Linear issue not found", "Could not load that pull request").
- No backend lists PRs or issues yet; the desktop app shows the "Set up GitHub" state and the browser uses samples. Creating from an existing branch or PR head sends `existingBranch: true` to `create_workspace` (#106), which checks out the local branch or tracks `origin/<branch>`. A fork PR's branch is not on origin, so it fails with "branch not found locally or on origin"; fetching `pull/N/head` is not built.
- `src/workspace/setupWatch.ts`: after `create_workspace` the dialog calls `scripts_config` ("Detecting setup script...") and, when `.setup` is set, `setup_script_start` with `workspaceRef(repo, ws)` and the base branch as `targetBranch` (#144, #157). `setupWatch` keeps "Running setup script..." on that workspace until `setupFinished` on `scripts://event` and returns the failure toast; tested by `src/workspace/setupWatch.test.ts`. `src/workspace/useSetupWatch.ts` mounts the listener in `App` and the header flag in `WorkspaceView`. Setup log and controls are the Setup tab (`src/components/ScriptsPanel.tsx`).
