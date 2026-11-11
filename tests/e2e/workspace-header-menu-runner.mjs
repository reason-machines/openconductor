import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { CASE_IDS, runWorkspaceHeaderMenuCases } from "./workspace-header-menu-cases.mjs";
import { verifyHeaderMenuResults } from "./workspace-header-menu-results.mjs";

const { values } = parseArgs({ options: {
  root: { type: "string" }, out: { type: "string" },
  source: { type: "string" }, expect: { type: "string" },
} });
assert.ok(values.root && values.out && values.source && values.expect, "require --root --out --source --expect");
assert.match(values.source, /^[a-f0-9]{40}$/);
assert.ok(["baseline", "candidate"].includes(values.expect));
const root = resolve(values.root);
const out = resolve(values.out);
await mkdir(out, { recursive: false });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const harnessRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./workspace-header-menu-cases.mjs", import.meta.url));
const fixtureSha = digest(await readFile(fixture));
assert.equal(fixtureSha, "b4f4cae76a414e5c3312ddd411e3b17ab39f90bc55b8662cdc058d55b2599605");
const source = git("rev-parse", "HEAD");
assert.equal(source, values.source, "the app checkout must match the requested source");
git("diff", "--exit-code", "HEAD", "--", "src", "package.json", "package-lock.json", "vite.config.ts", "index.html");
const lockSha = digest(await readFile(join(root, "package-lock.json")));
assert.equal(lockSha, digest(await readFile(join(harnessRoot, "package-lock.json"))), "baseline and candidate must use the same dependency lock");
assert.ok(existsSync(join(root, "dist/index.html")), "build this exact app checkout first");
const chrome = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].find((path) => path && existsSync(path));
assert.ok(chrome, "hosted Chrome is required");
const hashes = async (directory) => {
  const output = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(output, await hashes(path));
    else if (entry.isFile()) output[relative(root, path)] = digest(await readFile(path));
  }
  return output;
};
const renderer = await hashes(join(root, "dist"));
const sourcePaths = ["src/App.tsx", "src/components/WorkspaceView.tsx", "src/components/SidebarWorkspaceRow.tsx", "src/components/WorkspaceActionsMenu.tsx", "src/components/WorkspaceContextMenu.tsx", "src/components/WorkspaceNameHeader.tsx"];
const sourceFiles = {};
for (const path of sourcePaths) sourceFiles[path] = existsSync(join(root, path)) ? digest(await readFile(join(root, path))) : null;
const report = {
  producer: "Conductor Rebuild", expectation: values.expect, source,
  harnessSource: execFileSync("git", ["rev-parse", "HEAD"], { cwd: harnessRoot, encoding: "utf8" }).trim(),
  fixtureSha256: fixtureSha, packageLockSha256: lockSha, node: process.version,
  sourceFiles, renderer, startedAt: new Date().toISOString(),
  scope: "hosted production-renderer browser demo, not Tauri/native/original-Conductor parity",
  status: "INVALID", cases: [], setup: [], errors: [], screenshots: [],
};
let server;
let browser;
const save = () => writeFile(join(out, "results.json"), JSON.stringify(report, null, 2) + "\n");
await save();
try {
  server = await preview({ root, logLevel: "error", preview: { host: "127.0.0.1", port: 0, strictPort: false } });
  const baseURL = server.resolvedUrls.local[0].replace(/\/$/, "");
  report.baseURL = baseURL;
  browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  let navigation = 0;
  let preparedNavigation = -1;
  page.on("domcontentloaded", () => { navigation++; });
  const repoHeader = page.locator('.sb-repo-header[role="button"]').filter({
    has: page.locator(".sb-repo-name", { hasText: /^openconductor$/ }),
  });
  await page.addLocatorHandler(repoHeader, async () => {
    if (preparedNavigation === navigation) return;
    const setup = { caseId: CASE_IDS[report.cases.length], status: "INVALID", steps: [] };
    report.setup.push(setup);
    const expanded = await repoHeader.getAttribute("aria-expanded");
    assert.ok(expanded === "true" || expanded === "false", "repository expansion must be observable");
    setup.initialExpanded = expanded;
    // Store an explicit expanded choice; the default folds when pinning moves
    // the selected workspace out of this group. Use only the real UI control.
    if (expanded === "true") {
      await repoHeader.click();
      await page.locator('.sb-repo-header[aria-expanded="false"]').filter({
        has: page.locator(".sb-repo-name", { hasText: /^openconductor$/ }),
      }).waitFor({ state: "visible" });
      setup.steps.push("collapsed via repository button; observed aria-expanded=false");
    }
    await repoHeader.click();
    await page.locator('.sb-repo-header[aria-expanded="true"]').filter({
      has: page.locator(".sb-repo-name", { hasText: /^openconductor$/ }),
    }).waitFor({ state: "visible" });
    await page.locator('[data-testid="left-sidebar-workspace-item"] .sb-ws-name', { hasText: "Quiet harbor" }).waitFor({ state: "visible" });
    setup.steps.push("expanded via repository button; observed aria-expanded=true and Quiet harbor visible");
    setup.status = "READY";
    preparedNavigation = navigation;
    await save();
  }, { noWaitAfter: true });
  const screenshot = async (page, label) => {
    const path = join(out, label + ".png");
    await page.screenshot({ path });
    report.screenshots.push({ path: label + ".png", sha256: digest(await readFile(path)) });
  };
  report.cases = await runWorkspaceHeaderMenuCases(page, {
    baseURL, screenshot,
    onCase: async (result) => {
      console.log(JSON.stringify(result));
      report.cases.push(result);
      await save();
      if (result.status === "failed") await screenshot(page, result.id);
    },
  });
  verifyHeaderMenuResults(report.cases, CASE_IDS, values.expect);
  assert.deepEqual(report.setup.map(({ caseId }) => caseId), [...CASE_IDS], "every frozen case needs the same explicit UI setup");
  assert.ok(report.setup.every(({ status }) => status === "READY"), "incomplete repository setup invalidates proof");
  assert.equal(report.errors.length, 0, "renderer exceptions invalidate paired proof");
  report.status = values.expect === "baseline" ? "EXPECTED_RED" : "GREEN";
  console.log(JSON.stringify({ source, expectation: values.expect, status: report.status, cases: report.cases.length }));
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
  try { await browser?.close(); } finally {
    if (server) {
      server.httpServer.closeAllConnections();
      await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
    }
  }
}
