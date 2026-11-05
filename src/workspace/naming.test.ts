// Run: node --test "src/**/*.test.ts"  (Node 22.18+ strips types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CITIES,
  RARITIES,
  RARITY_WEIGHT,
  applyBranchPrefix,
  generateWorkspaceNames,
  initialNaming,
  pickCity,
  prefixSettingsFromInfo,
  planFirstMessageRename,
  resolveBranchPrefix,
  seededRng,
  slugify,
  uniqueName,
  validateBranchName,
  validateWorkspaceName,
  type City,
  type Rarity,
} from "./naming.ts";

test("every city is a unique, valid workspace and branch name", () => {
  const seen = new Set<string>();
  for (const c of CITIES) {
    assert.ok(!seen.has(c.name), `duplicate city ${c.name}`);
    seen.add(c.name);
    assert.equal(slugify(c.name), c.name);
    assert.deepEqual(validateWorkspaceName(c.name), { ok: true, value: c.name });
    assert.deepEqual(validateBranchName(c.name), { ok: true, value: c.name });
  }
  for (const r of RARITIES) assert.ok(CITIES.some((c) => c.rarity === r), `no ${r} cities`);
});

test("rarity tiers are drawn in proportion to their weights", () => {
  const rng = seededRng(42);
  const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  const draws = 20000;
  for (let i = 0; i < draws; i++) counts[pickCity(rng, CITIES)!.rarity]++;
  for (const r of RARITIES) {
    const expected = (RARITY_WEIGHT[r] / 100) * draws;
    assert.ok(Math.abs(counts[r] - expected) < expected * 0.15 + 30, `${r}: ${counts[r]} vs ~${expected}`);
  }
});

test("pickCity skips empty tiers and returns null for no candidates", () => {
  const only: City[] = [{ name: "atlantis", rarity: "legendary" }];
  const rng = seededRng(1);
  for (let i = 0; i < 20; i++) assert.equal(pickCity(rng, only)!.name, "atlantis");
  assert.equal(pickCity(rng, []), null);
});

test("uniqueName appends -v1, -v2 ... and ignores case", () => {
  assert.equal(uniqueName("oslo", []), "oslo");
  assert.equal(uniqueName("oslo", ["oslo"]), "oslo-v1");
  assert.equal(uniqueName("oslo", ["OSLO", "oslo-v1"]), "oslo-v2");
  assert.equal(uniqueName("oslo", ["oslo-v1"]), "oslo");
});

test("generated names are distinct, avoid taken names, and are reproducible", () => {
  const taken = ["tokyo", "paris", "lisbon"];
  const a = generateWorkspaceNames(10, taken, seededRng(7));
  const b = generateWorkspaceNames(10, taken, seededRng(7));
  assert.deepEqual(a, b);
  const names = a.map((g) => g.name);
  assert.equal(new Set(names).size, 10);
  for (const n of names) assert.ok(!taken.includes(n));
});

test("cities are reused with a version suffix once all are taken", () => {
  const cities: City[] = [
    { name: "oslo", rarity: "common" },
    { name: "nuuk", rarity: "rare" },
  ];
  const names = generateWorkspaceNames(5, ["oslo"], seededRng(3), cities).map((g) => g.name);
  assert.equal(names[0], "nuuk");
  assert.equal(new Set(names).size, 5);
  for (const n of names.slice(1)) assert.match(n, /^(oslo|nuuk)-v\d+$/);
});

test("branch prefix follows branch_prefix_type and branch_prefix", () => {
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "none" }, "sven"), "");
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "github_username" }, "SvenM"), "svenm/");
  assert.equal(resolveBranchPrefix({}, "sven"), "sven/");
  assert.equal(resolveBranchPrefix({}, null), "");
  // Stored custom values carry a trailing slash after the migration; both forms work.
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "custom", branch_prefix: "feat/" }), "feat/");
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "custom", branch_prefix: "team/ui" }), "team/ui/");
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "custom", branch_prefix: "  " }), "");
  assert.equal(applyBranchPrefix("sven/", "oslo"), "sven/oslo");
  assert.equal(applyBranchPrefix("sven/", "sven/oslo"), "sven/oslo");
  assert.equal(applyBranchPrefix("", "oslo"), "oslo");
});

test("workspace name validation", () => {
  for (const ok of ["oslo", "oslo-v2", "Fix_login.2", "a"]) assert.equal(validateWorkspaceName(ok).ok, true, ok);
  for (const bad of ["", " ", ".hidden", "-x", "a/b", "a b", "x..y", "end.", "x".repeat(65)]) {
    assert.deepEqual(validateWorkspaceName(bad), { ok: false, error: "Invalid workspace name" }, bad);
  }
});

test("branch name validation", () => {
  assert.deepEqual(validateBranchName("  "), { ok: false, error: "No branch name" });
  for (const ok of ["main", "sven/oslo", "release-1.2", "feat/a_b"]) assert.equal(validateBranchName(ok).ok, true, ok);
  for (const bad of ["-x", "a..b", "a b", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a\\b", "x/", "/x", "a//b", "x.lock", "a/.b", "@", "a@{b", "x."]) {
    assert.equal(validateBranchName(bad).ok, false, bad);
  }
});

test("slugify", () => {
  assert.equal(slugify("Fix the Login redirect!"), "fix-the-login-redirect");
  assert.equal(slugify("  São Paulo  "), "sao-paulo");
  assert.equal(slugify("---"), "");
  assert.ok(slugify("word ".repeat(30)).length <= 48);
  assert.ok(!slugify("word ".repeat(30)).endsWith("-"));
});

test("initialNaming marks generated names as placeholders and typed ones as user-set", () => {
  assert.deepEqual(initialNaming({ name: "oslo", prefix: "sven/" }), {
    workspace_name: "oslo",
    branch: "sven/oslo",
    placeholder_branch_name: "sven/oslo",
    user_set_workspace_name: false,
    user_set_branch_name: false,
  });
  assert.deepEqual(initialNaming({ name: "auth-fix", prefix: "sven/", userSetName: true }), {
    workspace_name: "auth-fix",
    branch: "sven/auth-fix",
    placeholder_branch_name: null,
    user_set_workspace_name: true,
    user_set_branch_name: false,
  });
  assert.deepEqual(initialNaming({ name: "oslo", prefix: "sven/", branch: "feature/pr-12" }), {
    workspace_name: "oslo",
    branch: "feature/pr-12",
    placeholder_branch_name: null,
    user_set_workspace_name: false,
    user_set_branch_name: true,
  });
});

const base = { prefix: "sven/", takenBranches: ["main", "sven/oslo"], takenWorkspaceNames: ["oslo"] };

test("first message renames placeholder branch and city name", () => {
  const ws = initialNaming({ name: "oslo", prefix: "sven/" });
  assert.deepEqual(planFirstMessageRename(ws, { ...base, generated: "Fix login redirect", autoRenameWorkspace: true }), {
    placeholder_branch_name: null,
    branch: "sven/fix-login-redirect",
    workspace_name: "fix-login-redirect",
  });
});

test("first message keeps the city name when auto-rename is off", () => {
  const ws = initialNaming({ name: "oslo", prefix: "sven/" });
  assert.deepEqual(planFirstMessageRename(ws, { ...base, generated: "fix-login", autoRenameWorkspace: false }), {
    placeholder_branch_name: null,
    branch: "sven/fix-login",
  });
});

test("first message never overrides user-set names", () => {
  const ws = { ...initialNaming({ name: "oslo", prefix: "sven/" }), user_set_branch_name: true, user_set_workspace_name: true };
  assert.deepEqual(planFirstMessageRename(ws, { ...base, generated: "x", autoRenameWorkspace: true }), {
    placeholder_branch_name: null,
  });
  const typed = initialNaming({ name: "mine", prefix: "sven/", userSetName: true });
  assert.deepEqual(planFirstMessageRename(typed, { ...base, generated: "x", autoRenameWorkspace: true }), {});
});

test("renamed branch stays unique and a renamed-away placeholder is left alone", () => {
  const ws = initialNaming({ name: "oslo", prefix: "sven/" });
  const plan = planFirstMessageRename(ws, {
    ...base,
    takenBranches: ["sven/oslo", "sven/fix-login", "sven/fix-login-v1"],
    takenWorkspaceNames: ["oslo", "fix-login"],
    generated: "fix login",
    autoRenameWorkspace: true,
  });
  assert.equal(plan.branch, "sven/fix-login-v2");
  assert.equal(plan.workspace_name, "fix-login-v1");
  // Branch already changed by hand (e.g. `git branch -m`) without the flag: leave it.
  const moved = { ...ws, branch: "sven/other" };
  assert.equal(planFirstMessageRename(moved, { ...base, generated: "x", autoRenameWorkspace: false }).branch, undefined);
  // Empty generation changes nothing.
  assert.deepEqual(planFirstMessageRename(ws, { ...base, generated: "!!!", autoRenameWorkspace: true }), {});
});

test("backend prefix info resolves to the branch prefix", () => {
  const resolve = (info: Parameters<typeof prefixSettingsFromInfo>[0]) => {
    const { settings, githubUsername } = prefixSettingsFromInfo(info);
    return resolveBranchPrefix(settings, githubUsername);
  };
  assert.equal(resolve({ branchPrefixType: "github_username", branchPrefix: null, githubUsername: "svemyh" }), "svemyh/");
  assert.equal(resolve({ branchPrefixType: "github_username", branchPrefix: null, githubUsername: null }), "");
  // settings.toml stores the custom prefix without the trailing slash.
  assert.equal(resolve({ branchPrefixType: "custom", branchPrefix: "sven", githubUsername: "svemyh" }), "sven/");
  assert.equal(resolve({ branchPrefixType: "custom", branchPrefix: "team/sven/", githubUsername: null }), "team/sven/");
  assert.equal(resolve({ branchPrefixType: "none", branchPrefix: "sven", githubUsername: "svemyh" }), "");
});
