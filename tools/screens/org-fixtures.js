// Cloud organization answers for ?oc_org=cloud (tools/screens/tauri-mock.js),
// keyed "METHOD /path" on api.conductor.build. Everything is invented for the
// harness. Shapes follow Conductor 0.87.6's response schemas in
// index-BGEQ8YjU.js: organization `iPe`, members `W1e`/`B1e`, machine
// `Qw`/`pPe`/`hPe`, default machine `H4`/`aPe`, repositories `RPe`/`oJ`,
// MCP servers `mPe`, environment `z4`, navigation sections `XPe`, settings
// scopes `G4`/`f1e` (scope `tu`). A value may be a function of the request's
// query parameters. Build times are relative to now, so Conductor's "N days
// ago" text is the same on every capture.
(function () {
  const ORG_ID = "org_demo_0001";
  const ORG = {
    id: ORG_ID,
    slug: "tide-labs",
    name: "Tide Labs",
    kind: "corporation",
    onboardingComplete: true,
    newMemberOnboardingComplete: true,
    plan: "pro",
    entitlements: [],
    supportsLocal: false,
  };
  const CREATED = "2026-01-15T09:00:00.000Z";
  const daysAgo = (d, minutes = 0) => new Date(Date.now() - d * 864e5 + minutes * 6e4).toISOString();
  const MEMBERS = [
    { id: "user_demo_0001", email: "ada@example.com", name: "Ada Demo", createdAt: CREATED, role: "admin" },
    { id: "user_demo_0002", email: "grace@example.com", name: "Grace Example", createdAt: "2026-02-03T10:30:00.000Z", role: "member" },
    { id: "user_demo_0003", email: "linus@example.com", name: "Linus Sample", createdAt: "2026-03-21T14:05:00.000Z", role: "member" },
  ];
  const REPOS = [
    { fullName: "tide-labs/tide-web", gitRemoteUrl: "https://github.com/tide-labs/tide-web.git" },
    { fullName: "tide-labs/tide-api", gitRemoteUrl: "https://github.com/tide-labs/tide-api.git" },
  ];
  const SETUP_SCRIPT = "brew install pnpm\npnpm install --frozen-lockfile";
  const MACHINE = {
    machineId: "machine_demo_0001",
    name: "Tide Labs computer",
    activeMachineVersionId: "mv_demo_0002",
    color: "bondi",
    // Oldest first: Conductor reads the last version as the latest build.
    versions: [
      {
        machineVersionId: "mv_demo_0001",
        versionNumber: 1,
        status: "ready",
        createdAt: daysAgo(9),
        startedAt: daysAgo(9),
        completedAt: daysAgo(9, 5),
        envVars: {},
        envVarKeys: [],
        machineSetupScript: "brew install pnpm",
        repositories: [{ gitRemoteUrl: REPOS[0].gitRemoteUrl }],
      },
      {
        machineVersionId: "mv_demo_0002",
        versionNumber: 2,
        status: "ready",
        createdAt: daysAgo(2),
        startedAt: daysAgo(2),
        completedAt: daysAgo(2, 5),
        envVars: {},
        envVarKeys: ["NODE_ENV"],
        machineSetupScript: SETUP_SCRIPT,
        repositories: REPOS.map(({ gitRemoteUrl }) => ({ gitRemoteUrl })),
      },
    ],
  };
  const DEFAULT_MACHINE = {
    machineId: MACHINE.machineId,
    name: MACHINE.name,
    machineVersionId: MACHINE.activeMachineVersionId,
    status: "ready",
    color: MACHINE.color,
    repositories: REPOS.map((r, i) => ({
      repositoryId: `repo_demo_000${i + 1}`,
      gitRemoteUrl: r.gitRemoteUrl,
      workspacePath: `/home/conductor/${r.fullName.split("/")[1]}`,
      defaultBranch: "main",
    })),
  };
  const ORG_PATH = `/organizations/${ORG_ID}`;
  /** Conductor's `tu` scope from the query its `VG` builds. */
  function scopeOf(q) {
    const type = q.get("type");
    if (type === "user") return { type };
    const s = { type, organizationId: q.get("organizationId") };
    if (q.get("gitRemoteUrl")) s.repo = { gitRemoteUrl: q.get("gitRemoteUrl") };
    return s;
  }

  window.__OC_ORG_FIXTURES__ = function (mode) {
    if (mode !== "cloud") return null;
    return {
      "GET /organizations": { organizations: [ORG] },
      [`GET ${ORG_PATH}/members`]: { members: MEMBERS },
      [`GET ${ORG_PATH}/machine`]: { machine: MACHINE },
      [`GET ${ORG_PATH}/default-machine`]: { defaultMachine: DEFAULT_MACHINE },
      [`GET ${ORG_PATH}/repositories`]: {
        canEditSettings: true,
        repositories: REPOS.map((r, i) => ({
          repositoryId: `repo_demo_000${i + 1}`,
          ...r,
          setupScript: null,
          runScript: null,
          defaultBranchOverride: null,
          githubAccessible: true,
          githubDefaultBranch: "main",
        })),
      },
      [`GET ${ORG_PATH}/environment`]: { envVars: { NODE_ENV: "production", TIDE_API_URL: "https://api.example.com" } },
      [`GET ${ORG_PATH}/navigation-sections`]: { sections: [] },
      [`GET ${ORG_PATH}/member-mcp-servers`]: { servers: [] },
      "GET /mcp-servers": { oauthCallbackUrl: "https://api.example.com/mcp/callback", servers: [] },
      "GET /minimum-client-version": { minimumClientVersion: "0.0.0" },
      // Nothing stored at any scope yet: Conductor shows its defaults.
      "GET /settings/scope": () => null,
      "GET /settings/value": (q) => ({ type: "setting-not-set", scope: scopeOf(q), key: q.get("key") }),
    };
  };
})();
