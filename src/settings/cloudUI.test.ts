import { test } from "node:test";
import assert from "node:assert/strict";
import { boolPref, withBoolPref } from "./prefs.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { USER_PAGES } from "./pages.ts";
import { cloudSettingsLocation, ORG_ROUTES, resolveSettingsUrl, type RouteContext } from "./routes.ts";

const general = { scope: "user", page: "general" };
const context: RouteContext = { repoIds: ["r"], userPages: USER_PAGES, organization: true };

test("cloud UI requires explicit true, including existing users with unrelated experimental settings", () => {
  for (const settings of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, experimental: { experimental_big_terminal_mode: true } }]) {
    assert.equal(boolPref(settings, "experimental_cloud_ui"), false);
  }
  for (const value of [false, "true", 1, null]) {
    assert.equal(boolPref({ ...DEFAULT_SETTINGS, experimental: { experimental_cloud_ui: value } }, "experimental_cloud_ui"), false);
  }
  const optedIn = withBoolPref(DEFAULT_SETTINGS, "experimental_cloud_ui", true);
  assert.equal(boolPref(JSON.parse(JSON.stringify(optedIn)), "experimental_cloud_ui"), true);
  assert.equal(boolPref(withBoolPref(optedIn, "experimental_cloud_ui", false), "experimental_cloud_ui"), false);
});

test("cloud settings links and legacy tab URLs are default-off even with a saved organization", () => {
  for (const path of ["/settings/cloud", "/settings/cloud/setup", ...ORG_ROUTES.map(([path]) => path)]) {
    assert.deepEqual(resolveSettingsUrl(path, "", context), general, path);
  }
  for (const tab of ["setup-cloud", "organization", "organization-members", "organization-computer"]) {
    assert.deepEqual(resolveSettingsUrl("/settings", `?tab=${tab}`, context), general, tab);
  }
  assert.deepEqual(resolveSettingsUrl("/settings/organization/members", "", { ...context, experimentalCloudUI: true }), { scope: "org", page: "members" });
  assert.deepEqual(resolveSettingsUrl("/settings/cloud/setup", "", { ...context, organization: false, experimentalCloudUI: true }), { scope: "user", page: "setup-cloud" });
});

test("in-app settings events are gated without gating agent/runtime or repository settings", () => {
  assert.deepEqual(cloudSettingsLocation({ scope: "org", page: "computer" }, false), general);
  assert.deepEqual(cloudSettingsLocation({ scope: "user", page: "setup-cloud" }, false), general);
  for (const location of [{ scope: "user", page: "providers" }, { scope: "repo", repoId: "r", section: "environment" }] as const) {
    assert.deepEqual(cloudSettingsLocation(location, false), location);
  }
});
