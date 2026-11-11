import { fakeBackend, FILES } from "../../tests/e2e/right-panel-fixture.mjs";
import { installOpenInBackend } from "../../tests/e2e/open-in-fixture.mjs";

export const PROJECT_SHELL = {
  repos: [
    ["repo-tide-web", "tide-web", [["ws-lisbon", "lisbon", "ada/fix-login-redirect"], ["ws-osaka", "osaka", "ada/dark-mode-tokens"], ["ws-quito", "quito", "ada/settings-search"]]],
    ["repo-tide-api", "tide-api", [["ws-tallinn", "tallinn", "ada/rate-limit-headers"], ["ws-accra", "accra", "ada/pagination-cursor"]]],
    ["repo-dotfiles", "dotfiles", [["ws-bergen", "bergen", "ada/zsh-prompt"]]],
  ].map(([id, name, workspaces]) => ({
    id, name, path: `/Users/demo/code/${name}`, defaultBranch: "main", collapsed: true,
    workspaces: workspaces.map(([id, name, branch]) => ({ id, name, branch, status: "idle", path: `/Users/demo/.conductor/workspaces/${name}`, diff: { added: 0, removed: 0 }, createdAt: 1 })),
  })),
  selection: { kind: "root" },
};

export function projectsInit() {
  return `(${fakeBackend})(${JSON.stringify({ shell: PROJECT_SHELL, files: FILES })});(${installOpenInBackend})(${JSON.stringify({ apps: [], initialPrefs: { onboarding_step: 99, first_time_onboarding_step: 999 }, palette: "stone" })});`;
}
