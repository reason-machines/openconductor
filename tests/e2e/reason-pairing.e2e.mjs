import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { startPairingServer } from "../../tools/reason-pairing/server.mjs";
import { buildRustBridge, startRustBridge } from "../../tools/reason-pairing/rust-bridge.mjs";

let base = process.env.TEST_BASE_URL;
let browser;
let vite;
let pairing;
let temporary;
let binary;
const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((path) => path && existsSync(path));
const evidence = process.env.REASON_PAIRING_EVIDENCE;
const post = (path, body = {}) => fetch(pairing.origin + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  assert.ok(executablePath, "Chromium is required for the Reason pairing E2E");
  temporary = await mkdtemp(join(tmpdir(), "oc-pairing-e2e-"));
  binary = await buildRustBridge(resolve("."), join(temporary, "rust"));
  pairing = await startPairingServer();
  if (!base) {
    vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    await vite.listen();
    base = vite.resolvedUrls.local[0].replace(/\/$/, "");
  }
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  await vite?.close();
  await pairing?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

async function fixture({ entry = "settings", strict = true, workspace, timeoutMs, loginDelayMs, existing = false, failOpen = false } = {}) {
  const client = randomUUID();
  const home = join(temporary, client);
  await mkdir(home);
  if (existing) {
    const pending = await (await post(`/clients/${client}/login`)).json();
    await post(`/pairings/${pending.id}/approve`, { account: "sam", workspace: "ws-beta" });
    await post(`/pairings/${pending.id}/poll`);
  }
  const bridge = startRustBridge(binary, { home, origin: pairing.origin, client, executable: resolve("tools/reason-pairing/fake-reason.py"), timeoutMs, loginDelayMs });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: "reduce" });
  const opened = [];
  const external = [];
  const errors = [];
  let rejectOpen = failOpen;
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if ([new URL(base).origin, pairing.origin].includes(url.origin)) return route.continue();
    external.push(url.origin);
    return route.abort("blockedbyclient");
  });
  await context.exposeBinding("__pairingInvoke", async (_, command, args) => {
    if (command === "plugin:opener|open_url") {
      assert.equal(new URL(args.url).origin, pairing.origin, "only the emitted local fake pairing URL can open");
      if (rejectOpen) { rejectOpen = false; throw new Error("Fixture browser opener refused"); }
      const approval = await context.newPage();
      await approval.goto(args.url);
      await approval.getByRole("status").filter({ hasText: "Waiting for your approval" }).waitFor();
      opened.push(approval);
      return;
    }
    return bridge.invoke(command, args);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const params = new URLSearchParams({ entry, strict: strict ? "1" : "0" });
  if (workspace) params.set("workspace", workspace);
  await page.goto(`${base}/tools/reason-pairing/index.html?${params}`);
  return {
    page, client, bridge, opened, errors,
    async state() { return JSON.parse(await page.getByTestId("login-state").textContent()); },
    async waitState(state) {
      await page.waitForFunction((wanted) => JSON.parse(document.querySelector('[data-testid="login-state"]').textContent).state === wanted, state, { timeout: 10_000 });
      return this.state();
    },
    async start() {
      await page.getByRole("button", { name: entry === "onboarding" ? "Sign up" : "Sign in with Reason", exact: true }).click();
      await this.waitState("waiting");
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="reason-login-code"]')), null, { timeout: 5000 });
      for (let i = 0; i < 50 && !opened.length; i++) await new Promise((resolve) => setTimeout(resolve, 20));
      if (!failOpen) assert.equal(opened.length, 1, "one real browser page opened");
      return this.state();
    },
    async approve(account = "sam", workspace = "ws-beta") {
      const approval = opened.at(-1);
      await approval.getByRole("combobox", { name: "Fixture account" }).selectOption(account);
      await approval.getByRole("combobox", { name: "Fixture workspace" }).selectOption(workspace);
      await approval.getByRole("button", { name: "Approve fixture sign-in", exact: true }).click();
      await approval.getByRole("status").filter({ hasText: "Fixture approved" }).waitFor();
    },
    async capture(name) {
      if (!evidence) return;
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, `${name}.png`) });
      if (opened.length) await opened.at(-1).screenshot({ path: join(evidence, `${name}-approval.png`) });
    },
    async close() {
      try { assert.deepEqual(external, [], "no request reached a production origin"); assert.deepEqual(errors, [], "no browser runtime errors"); }
      finally { await context.close(); await bridge.close(); }
    },
  };
}

for (const entry of ["settings", "onboarding", "chat"]) {
  for (const strict of [false, true]) {
    test(`${entry}, StrictMode=${strict}: browser approval gates Rust CLI login and returns selected account/workspace`, async () => {
      const f = await fixture({ entry, strict, workspace: entry === "settings" ? "ws-beta" : undefined });
      try {
        const waiting = await f.start();
        assert.equal(await f.opened[0].locator("#code").textContent(), waiting.prompt.code);
        assert.match(waiting.prompt.url, /^http:\/\/127\.0\.0\.1:/);
        for (let i = 0; i < 3; i++) assert.equal((await f.bridge.invoke("reason_account_status")).email, null);
        assert.equal((await f.bridge.invoke("reason_login_status")).state, "waiting");
        assert.equal(await f.page.getByTestId("onboarding-completion-count").textContent(), "0");
        await f.capture(`${entry}-waiting-strict-${strict}`);
        await f.approve();
        const connected = await f.waitState("connected");
        assert.equal(connected.account.email, "sam@example.invalid");
        assert.equal(connected.account.workspaces.find((w) => w.selected).slug, "ws-beta");
        await f.page.getByTestId("reason-login-connected").getByText("Connected as sam@example.invalid.", { exact: true }).waitFor();
        if (entry === "onboarding") assert.equal(await f.page.getByTestId("onboarding-completion-count").textContent(), "1");
        assert.equal(f.opened.length, 1);
        await f.capture(`${entry}-connected-strict-${strict}`);
      } finally { await f.close(); }
    });
  }
}

test("all entry points share one attempt across switches and control remounts", async () => {
  const f = await fixture();
  try {
    const initial = await f.start();
    for (const entry of ["chat", "onboarding", "settings"]) {
      await f.page.getByRole("button", { name: entry, exact: true }).click();
      assert.equal((await f.state()).attemptId, initial.attemptId);
      await f.page.getByRole("button", { name: "Unmount controls", exact: true }).click();
      await f.page.getByRole("button", { name: "Mount controls", exact: true }).click();
      await f.page.getByTestId("reason-login-code").waitFor();
    }
    assert.equal(f.opened.length, 1);
    assert.equal(pairing.events.filter((e) => e.client === f.client && e.type === "created").length, 1);
    await f.approve("alex", "ws-alpha");
    const connected = await f.waitState("connected");
    assert.equal(connected.account.email, "alex@example.invalid");
  } finally { await f.close(); }
});

test("cancel stops local polling and ignores approval arriving afterwards", async () => {
  const f = await fixture();
  try {
    await f.start();
    await f.page.getByRole("button", { name: "Cancel", exact: true }).click();
    await f.waitState("cancelled");
    const before = pairing.events.filter((e) => e.client === f.client).length;
    await f.approve();
    await new Promise((resolve) => setTimeout(resolve, 1400));
    assert.equal((await f.state()).state, "cancelled");
    assert.equal(pairing.events.filter((e) => e.client === f.client).length, before);
    assert.equal(await f.page.getByTestId("onboarding-completion-count").textContent(), "0");
    await f.page.getByRole("button", { name: "Retry sign-in", exact: true }).waitFor();
    await f.capture("cancelled-late-approval");
  } finally { await f.close(); }
});

test("retry has a new local attempt and a stale cancellation cannot cancel it", async () => {
  const f = await fixture();
  try {
    const first = await f.start();
    await f.page.getByRole("button", { name: "Cancel", exact: true }).click();
    await f.waitState("cancelled");
    await f.page.getByRole("button", { name: "Retry sign-in", exact: true }).click();
    const second = await f.waitState("waiting");
    assert.notEqual(second.attemptId, first.attemptId);
    const stale = await f.bridge.invoke("reason_login_cancel", { attemptId: first.attemptId });
    assert.equal(stale.state, "waiting");
    assert.equal(stale.attemptId, second.attemptId);
    for (let i = 0; i < 50 && f.opened.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(f.opened.length, 2);
    await f.approve();
    await f.waitState("connected");
  } finally { await f.close(); }
});

test("timeout is canonical and retry starts a usable browser sign-in", async () => {
  const f = await fixture({ timeoutMs: 2600 });
  try {
    await f.start();
    await f.waitState("timedOut");
    assert.equal(await f.page.getByTestId("onboarding-completion-count").textContent(), "0");
    await f.page.getByRole("button", { name: "Retry sign-in", exact: true }).click();
    await f.waitState("waiting");
    await f.page.waitForFunction(() => document.querySelector('[data-testid="reason-login-code"]') !== null);
    for (let i = 0; i < 50 && f.opened.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(f.opened.length, 2);
    await f.approve();
    await f.waitState("connected");
  } finally { await f.close(); }
});

test("existing login connects without a browser or another pairing", async () => {
  const f = await fixture({ existing: true });
  try {
    const connected = await f.waitState("connected");
    assert.equal(connected.account.email, "sam@example.invalid");
    assert.equal(f.opened.length, 0);
    assert.equal(pairing.events.filter((e) => e.client === f.client && e.type === "created").length, 1);
  } finally { await f.close(); }
});

test("external credential expiry is observed after a fresh frontend mount", async () => {
  const f = await fixture({ existing: true });
  try {
    await f.waitState("connected");
    await post(`/clients/${f.client}/logout`);
    await f.page.reload();
    await f.waitState("idle");
    await f.page.getByRole("button", { name: "Sign in with Reason", exact: true }).waitFor();
    assert.equal(f.opened.length, 0);
    assert.equal((await f.bridge.invoke("reason_account_status")).email, null);
  } finally { await f.close(); }
});

test("approval racing cancellation preserves the saved CLI account without global logout", async () => {
  const f = await fixture();
  try {
    const waiting = await f.start();
    const finished = once(pairing.completions, "completed", { signal: AbortSignal.timeout(5000) });
    const [, cancelled] = await Promise.all([f.approve(), f.bridge.invoke("reason_login_cancel", { attemptId: waiting.attemptId })]);
    assert.deepEqual(await finished, [f.client]);
    assert.ok(["cancelled", "connected"].includes(cancelled.state));
    await f.waitState(cancelled.state);
    const account = await f.bridge.invoke("reason_account_status");
    assert.equal(account.email, "sam@example.invalid");
    assert.equal(pairing.events.filter((e) => e.client === f.client && e.type === "logout").length, 0);
    if (cancelled.state === "cancelled") {
      await f.page.getByRole("button", { name: "Retry sign-in", exact: true }).click();
      await f.waitState("connected");
    }
    assert.equal(f.opened.length, 1);
  } finally { await f.close(); }
});

test("delayed CLI URL keeps starting visible and does not block cancel", async () => {
  const f = await fixture({ loginDelayMs: 4000 });
  try {
    await f.page.getByRole("button", { name: "Sign in with Reason", exact: true }).click();
    await f.waitState("starting");
    await f.page.getByText("Preparing Reason sign-in...", { exact: true }).waitFor();
    await f.page.getByRole("button", { name: "Cancel", exact: true }).click();
    await f.waitState("cancelled");
    assert.equal(f.opened.length, 0);
    assert.equal(pairing.events.filter((e) => e.client === f.client && e.type === "created").length, 0);
  } finally { await f.close(); }
});

test("browser opener failure is visible and explicit reopen preserves the pending attempt", async () => {
  const f = await fixture({ failOpen: true });
  try {
    const waiting = await f.start();
    await f.page.getByRole("alert").filter({ hasText: "Couldn't open your default browser" }).waitFor();
    assert.equal(f.opened.length, 0);
    await f.page.getByRole("button", { name: "Open the sign-in page again", exact: true }).click();
    for (let i = 0; i < 50 && !f.opened.length; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(f.opened.length, 1);
    assert.equal((await f.state()).attemptId, waiting.attemptId);
    await f.approve();
    await f.waitState("connected");
  } finally { await f.close(); }
});
