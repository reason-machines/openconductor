import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.CLOUD_UI_BASE_URL;
const executablePath = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => p && existsSync(p));

function fixture() {
  const key = "cloud-ui-test-settings";
  const defaults = {
    general: { theme: "dark", send_native_notification: true, sound_type: "default" },
    appearance: { zoom_level_v2: 1, low_contrast_dark_mode: false },
    git: { branch_prefix_type: "github_username", delete_branch_on_archive: false, archive_on_merge: false, worktree_push_auto_setup_remote: true },
    models: { default: "opus", default_thinking_enabled: true, review_thinking_enabled: true, codex: { default_thinking_level: "medium", review_thinking_level: "medium" } },
    providers: {},
  };
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => 1,
    async invoke(cmd, args) {
      switch (cmd) {
        case "get_settings": return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(defaults));
        case "update_settings": localStorage.setItem(key, JSON.stringify(args.settings)); return args.settings;
        case "reason_account_status": return { name: "Ada Demo", email: "ada@example.com", credential: "login", workspaces: [] };
        case "local_account": return { name: "Ada Demo", email: "ada@example.com" };
        case "reason_cloud_setup": return { signedIn: true, identity: null, funding: null, agentsAvailable: null, repositories: null, error: null };
        case "reason_api_call": return args.operation === "listOrganizations" ? { items: [{ id: "org-demo", slug: "demo", name: "Demo team", membership_role: "owner" }] } : { items: [] };
        case "app_info": return { name: "OpenConductor", version: "test", platform: "macos" };
        case "get_app_prefs": return { left_panel_visible: true, right_panel_visible: true, left_panel_width: 256, onboarding_step: 0, first_time_onboarding_step: 1, open_in_mru_order: [] };
        case "db_first_run_onboarding_step": return "999";
        case "db_list_repos":
        case "db_list_workspaces": return [];
        case "db_read_navigation_sections": return null;
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return;
        default: throw new Error(`Isolated cloud UI fixture does not implement ${cmd}`);
      }
    },
  };
  localStorage.setItem("openconductor.organization.v1", JSON.stringify({ id: "org-demo", slug: "demo", name: "Demo team", role: "owner" }));
}

const screenshots = process.env.CLOUD_UI_SCREENSHOTS;
async function capture(page, name) {
  if (!screenshots) return;
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/${name}.png` });
}

test("cloud UI is default-off, explicit opt-in persists, routes and account entries are gated", { skip: !base }, async () => {
  assert.ok(executablePath, "Chrome is required");
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: "reduce" });
  await context.addInitScript(fixture);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    await page.goto(base);
    await page.getByRole("button", { name: "Account menu" }).waitFor();
    if (process.env.CLOUD_UI_BEFORE === "1") {
      await page.getByRole("button", { name: "Routines", exact: true }).waitFor();
      await capture(page, "before-default");
      return;
    }
    await page.getByRole("button", { name: /^Home/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Routines", exact: true }).count(), 0);
    await capture(page, "after-default");
    await page.getByRole("button", { name: "Account menu" }).click();
    assert.equal(await page.getByRole("menuitemradio").count(), 0);
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Experimental", exact: true }).click();
    const toggle = page.getByRole("switch", { name: "Cloud UI (experimental)", exact: true });
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), false);
    await toggle.click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("cloud-ui-test-settings"))?.experimental?.experimental_cloud_ui === true);
    await capture(page, "experimental-opt-in");
    await page.goto(base);
    await page.getByRole("button", { name: "Routines", exact: true }).waitFor();
    await capture(page, "after-opt-in");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitemradio", { name: "Demo team" }).waitFor();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Members", exact: true }).waitFor();
    await page.goto(`${base}/settings/organization/members`);
    await page.getByRole("heading", { name: "Members", exact: true }).waitFor();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitemradio", { name: "Ada Demo's Mac" }).click();
    await page.getByRole("button", { name: "Cloud setup", exact: true }).waitFor();
    await page.getByRole("button", { name: "Cloud setup", exact: true }).click();
    await page.getByRole("heading", { name: /^Cloud setup/ }).waitFor();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("heading", { name: "Routines", exact: true }).waitFor();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Experimental", exact: true }).click();
    await page.getByRole("switch", { name: "Cloud UI (experimental)", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("cloud-ui-test-settings"))?.experimental?.experimental_cloud_ui === false);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByText("Open project", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Routines", exact: true }).count(), 0);
    for (const route of ["/settings/cloud/setup", "/settings/organization/members", "/settings?tab=organization-computer", "/routines", "/routines/new", "/automations"]) {
      await page.goto(`${base}${route}`);
      await page.waitForFunction(() => !/routines|automations|organization|cloud/.test(location.pathname));
      assert.equal(await page.locator(".routines-page, .routine-editor").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Members", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Cloud setup", exact: true }).count(), 0);
    }
    await page.goto(`${base}/?palette=1`);
    await page.getByRole("dialog").waitFor();
    assert.doesNotMatch(await page.getByRole("dialog").innerText(), /Routines|Triage|Cloud setup|Demo team/);
    await page.goto(`${base}/settings/user/providers?providerTab=reason`);
    await page.getByRole("tab", { name: "Reason", exact: true }).waitFor();
    await page.getByText("Workspace for new chats", { exact: true }).waitFor();
  } catch (error) {
    console.error((await page.locator("body").innerText()).slice(0, 2000));
    await capture(page, "failure");
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
});
