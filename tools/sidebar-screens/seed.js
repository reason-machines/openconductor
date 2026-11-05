// Invented data for OpenConductor sidebar captures, mirroring the populated
// scenario of tools/screens/seed-data.js (repos tide-web, tide-api, dotfiles; six
// city workspaces) so our screens line up with evidence/screens/sidebar--*.png.
// Written into OpenConductor's localStorage app state before the app boots.
// Fields our current model does not know (unread, prTitle, updatedAt) are ignored
// by older builds, so the same seed captures main and a branch.
(function () {
  const now = Date.now();
  const ago = (m) => now - m * 60000;
  // [id, repo, directory (city), branch, minutes ago, unread, pr title, diff]
  const ws = [
    ["ws-lisbon", "repo-tide-web", "lisbon", "ada/fix-login-redirect", 12, false, null, [15, 1]],
    ["ws-osaka", "repo-tide-web", "osaka", "ada/dark-mode-tokens", 3, false, null, [0, 0]],
    ["ws-quito", "repo-tide-web", "quito", "ada/settings-search", 95, true, "Add search to settings", [0, 0]],
    ["ws-tallinn", "repo-tide-api", "tallinn", "ada/rate-limit-headers", 6, true, null, [0, 0]],
    ["ws-accra", "repo-tide-api", "accra", "ada/pagination-cursor", 1440, false, "Cursor pagination for /events", [0, 0]],
    ["ws-bergen", "repo-dotfiles", "bergen", "ada/zsh-prompt", 300, false, null, [0, 0]],
  ];
  const repo = (id, name, remote) => ({
    id, name, path: `/Users/demo/code/${name}`, remote, defaultBranch: "main", collapsed: true,
    workspaces: ws.filter((w) => w[1] === id).map(([wid, , dir, branch, m, unread, prTitle, [added, removed]]) => ({
      id: wid, name: dir, branch, status: "idle", diff: { added, removed }, createdAt: ago(m + 60), updatedAt: ago(m), unread, prTitle: prTitle ?? undefined,
    })),
  });
  const state = {
    repos: [
      repo("repo-tide-web", "tide-web", "git@github.com:tide-labs/tide-web.git"),
      repo("repo-tide-api", "tide-api", "git@github.com:tide-labs/tide-api.git"),
      repo("repo-dotfiles", "dotfiles", "git@github.com:ada-demo/dotfiles.git"),
    ],
    selection: { kind: "home" },
  };
  const scenario = new URLSearchParams(location.search).get("oc_scenario");
  if (scenario === "populated") localStorage.setItem("openconductor.shell.v1", JSON.stringify(state));
  else if (scenario === "empty") localStorage.removeItem("openconductor.shell.v1");
})();
