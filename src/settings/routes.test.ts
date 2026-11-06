import { test } from "node:test";
import assert from "node:assert/strict";
import { USER_PAGES } from "./pages.ts";
import { CLOUD_ONLY_ROUTES, TAB_PATHS, keptSearch, resolveSettingsUrl, settingsDeepLink, settingsPath, type RouteContext } from "./routes.ts";

const ctx: RouteContext = { repoIds: ["r1", "r2"], lastRepoId: null, userPages: USER_PAGES };
const at = (url: string, c: RouteContext = ctx) => {
  const u = new URL(url, "http://x");
  const loc = resolveSettingsUrl(u.pathname, u.search, c);
  return loc && settingsPath(loc);
};

test("non-settings paths open no settings", () => {
  for (const p of ["/", "/create", "/settingsx", "/x/settings"]) assert.equal(at(p), null);
});

test("/settings and /settings/user open General", () => {
  assert.equal(at("/settings"), "/settings/user/general");
  assert.equal(at("/settings/"), "/settings/user/general");
  assert.equal(at("/settings/user"), "/settings/user/general");
  assert.equal(at("/settings/user/"), "/settings/user/general");
});

test("every built user page has its own route", () => {
  for (const page of USER_PAGES) assert.equal(at(`/settings/user/${page}`), `/settings/user/${page}`);
  assert.equal(at("/settings/user/account"), "/settings/user/account");
  assert.equal(at("/settings/user/environment"), "/settings/user/environment");
});

test("unknown and gated user tabs open General", () => {
  for (const tab of ["nope", "ports", "internal"]) assert.equal(at(`/settings/user/${tab}`), "/settings/user/general");
  assert.equal(at("/settings/user/general/extra"), "/settings/user/general");
});

test("cloud and organization routes need a cloud org, so they open General", () => {
  const concrete = (p: string) => p.replace("$cloudProjectId", "proj").replace("$owner", "acme").replace("$repo", "app");
  for (const p of CLOUD_ONLY_ROUTES) assert.equal(at(concrete(p)), "/settings/user/general", p);
  assert.equal(at("/settings?cloudProjectId=p1"), "/settings/user/general");
});

test("/settings/repos opens the last-viewed repository, else the first, else General", () => {
  assert.equal(at("/settings/repos"), "/settings/repos/r1/environment");
  assert.equal(at("/settings/repos", { ...ctx, lastRepoId: "r2" }), "/settings/repos/r2/environment");
  assert.equal(at("/settings/repos", { ...ctx, lastRepoId: "gone" }), "/settings/repos/r1/environment");
  assert.equal(at("/settings/repos?section=scripts"), "/settings/repos/r1/scripts");
  assert.equal(at("/settings/repos?section=bogus"), "/settings/repos/r1/environment");
  assert.equal(at("/settings/repos", { ...ctx, repoIds: [] }), "/settings/user/general");
});

test("repository sections", () => {
  assert.equal(at("/settings/repos/r2"), "/settings/repos/r2/environment");
  for (const s of ["environment", "git", "scripts", "actions", "misc"]) assert.equal(at(`/settings/repos/r2/${s}`), `/settings/repos/r2/${s}`);
  assert.equal(at("/settings/repos/r2/bogus"), "/settings/user/general");
  // A repository that is not registered falls back to the repos index, keeping the section.
  assert.equal(at("/settings/repos/gone/git"), "/settings/repos/r1/git");
});

test("the /settings index redirect (?tab=, ?repoId=)", () => {
  assert.equal(at("/settings?tab=appearance"), "/settings/user/appearance");
  assert.equal(at("/settings?tab=providers&providerTab=codex"), "/settings/user/providers");
  assert.equal(at("/settings?tab=organization-prompts"), "/settings/user/general");
  assert.equal(at("/settings?tab=setup-cloud"), "/settings/user/general");
  assert.equal(at("/settings?tab=unknown"), "/settings/user/general");
  assert.equal(at("/settings?tab=repo-r2"), "/settings/repos/r2/misc");
  assert.equal(at("/settings?tab=scripts&repoId=r2"), "/settings/repos/r2/scripts");
  // Repo-only sections without a repo go to the repos index; git and environment have user pages.
  assert.equal(at("/settings?tab=actions"), "/settings/repos/r1/actions");
  assert.equal(at("/settings?tab=git"), "/settings/user/git");
  assert.equal(at("/settings?tab=environment"), "/settings/user/environment");
  for (const tab of Object.keys(TAB_PATHS)) assert.match(at(`/settings?tab=${tab}`) ?? "", /^\/settings\/(user|repos)\//);
});

test("repo ids are URL-encoded both ways", () => {
  const c = { ...ctx, repoIds: ["a b"] };
  assert.equal(at("/settings/repos/a%20b/git", c), "/settings/repos/a%20b/git");
});

test("a resolved URL keeps unrelated search parameters only", () => {
  assert.equal(keptSearch("?tab=git&demo=1&repoId=r"), "?demo=1");
  assert.equal(keptSearch("?section=scripts"), "");
  assert.equal(keptSearch(""), "");
});

test("Copy link on a settings page copies its deep link (Conductor's TGt)", () => {
  assert.equal(settingsDeepLink({ scope: "user", page: "general" }), "openconductor://settings/user/general");
  assert.equal(settingsDeepLink({ scope: "user", page: "providers" }), "openconductor://settings/user/providers");
  assert.equal(settingsDeepLink({ scope: "user", page: "key-bindings" }), "openconductor://settings/user/key-bindings");
  assert.equal(settingsDeepLink({ scope: "repo", repoId: "a b", section: "misc" }), "openconductor://settings/repos/a%20b/misc");
});
