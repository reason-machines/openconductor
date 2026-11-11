import { useState } from "react";
import { KeybindingsProvider, useKeybindingOverrides } from "../../src/keybindings/KeybindingsProvider";
import { createRoot } from "react-dom/client";
import { RenameWorkspaceDialog } from "../../src/components/RenameWorkspaceDialog";
import { CloneGitHubRepoDialog } from "../../src/components/CloneGitHubRepoDialog";
import { CreateProjectDialog } from "../../src/components/CreateProjectDialog";
import { CreateWorkspaceDialog } from "../../src/components/CreateWorkspaceDialog";
import { DEFAULT_SETTINGS } from "../../src/settings/types";
import { ArchiveRunningDialog } from "../../src/components/ArchiveRunningDialog";
import { RemoveRepositoryDialog } from "../../src/components/RemoveRepositoryDialog";
import { RestoreWorkspaceDialog } from "../../src/components/RestoreWorkspaceDialog";
import type { Action } from "../../src/state/store";
import type { Repo, Workspace } from "../../src/state/types";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/components/motion/motion.css";
import "../../src/components/motion/screens.css";

const workspace: Workspace = { id: "fixture-workspace", name: "lisbon", branch: "ada/fix-login-redirect", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0 };
const repo: Repo = { id: "fixture-repo", name: "tide-web", path: "/Users/demo/code/tide-web", defaultBranch: "main", workspaces: [workspace] };

function Fixture() {
  const [dialog, setDialog] = useState(new URLSearchParams(location.search).get("dialog"));
  const [events, setEvents] = useState<unknown[]>([]);
  const { overridesLoaded } = useKeybindingOverrides();
  const close = () => setDialog(null);
  const record = (event: unknown) => setEvents((old) => [...old, event]);
  const dispatch = (action: Action) => record(action);
  return <>
    <nav style={{ padding: 16, display: "flex", gap: 8 }}>
      {["rename", "clone", "create", "workspace", "archive", "remove", "restore"].map((name) => <button key={name} type="button" onClick={() => setDialog(name)}>{name}</button>)}
    </nav>
    <output data-testid="events" data-overrides-ready={overridesLoaded}>{JSON.stringify(events)}</output>
    {dialog === "rename" && <RenameWorkspaceDialog repoId={repo.id} workspace={workspace} dispatch={dispatch} onClose={close} onError={record} />}
    {dialog === "clone" && <CloneGitHubRepoDialog onClose={close} onCloned={record} />}
    {dialog === "create" && <CreateProjectDialog onClose={close} onCreated={record} onRepoAdded={record} />}
    {dialog === "workspace" && <CreateWorkspaceDialog repos={[repo]} initialRepoId={repo.id} prefixSettings={{ branch_prefix_type: "none" }} githubUsername={null} onClose={close} dispatch={dispatch} onWarning={record} addActions={{ onOpenProject: () => record("open-project"), onOpenGitHubProject: () => record("open-github"), onQuickStart: () => record("quick-start"), onAddProjectAt: record }} />}
    {dialog === "archive" && <ArchiveRunningDialog onClose={close} onConfirm={() => record("archive")} />}
    {dialog === "remove" && <RemoveRepositoryDialog repo={repo} onClose={close} onRemoved={() => { record("removed"); close(); }} onError={record} />}
    {dialog === "restore" && <RestoreWorkspaceDialog request={{ repoId: repo.id, workspaceId: workspace.id, branch: workspace.branch, scenario: "branchDeleted" }} dispatch={dispatch} onClose={close} />}
  </>;
}
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "dark";
if (params.get("workspaceFixture") === "1") {
  Reflect.set(window, "isTauri", true);
  Reflect.set(window, "__TAURI_INTERNALS__", {
    async invoke(command: string) {
      if (command === "get_settings") return DEFAULT_SETTINGS;
      if (command === "favorite_models_list") return [];
      if (command === "local_storage_get_entry") return null;
      if (command === "ensure_repository") return { id: repo.id, name: repo.name, root: repo.path, defaultBranch: "main" };
      if (command === "list_branches") return [{ name: "main", remote: null, commit: "", isHead: true, committedAt: 0 }];
      if (command === "pr_list_open" || command === "gh_issue_list_open") return [];
      if (command === "create_workspace") {
        document.documentElement.dataset.createPending = "true";
        return new Promise((_resolve, reject) => window.addEventListener("fixture:reject-create", () => reject(new Error("Fixture creation failed")), { once: true }));
      }
      throw new Error(`Workspace fixture does not implement ${command}`);
    },
  });
}
if (params.get("reference") === "1") {
  document.documentElement.dataset.colorPalette = "stone";
  Reflect.set(window, "isTauri", true);
  Reflect.set(window, "__TAURI_INTERNALS__", {
    async invoke(command: string, args?: { options?: unknown }) {
      if (command === "plugin:dialog|open") {
        document.documentElement.dataset.pickerRequest = JSON.stringify(args?.options);
        return params.get("pickerResult");
      }
      if (command === "github_recent_repos") return [];
      if (command === "github_git_protocol") return "https";
      if (command === "default_clone_directory") return "/Users/demo/conductor/repos";
      if (command === "get_app_prefs") return {};
      if (command === "local_storage_get_entry") return null;
      throw new Error(`Isolated screenshot fixture does not implement ${command}`);
    },
  });
}
const root = document.getElementById("root");
const loadOverrides = params.has("customShortcut") ? async () => JSON.stringify({ version: 1, overrides: { "dialog.primaryAction": [{ key: { kind: "logical", value: "Enter" }, modifiers: ["alt"] }] } }) : undefined;
if (root) createRoot(root).render(<KeybindingsProvider loadOverrides={loadOverrides}><Fixture /></KeybindingsProvider>);
