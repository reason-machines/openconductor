import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { startPairingServer } from "./server.mjs";

const execute = promisify(execFile);
const fake = fileURLToPath(new URL("./fake-reason.py", import.meta.url));
const post = (origin, path, body = {}) => fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function withFixture(run, options) {
  const fixture = await startPairingServer(options);
  try { await run(fixture); } finally { await fixture.close(); }
}

test("status and poll cannot approve a pending pairing", () => withFixture(async ({ origin, events }) => {
  const pairing = await (await post(origin, "/clients/pending/login")).json();
  for (let i = 0; i < 3; i++) {
    assert.equal((await (await fetch(origin + "/clients/pending/status")).json()).account, null);
    assert.equal((await (await post(origin, `/pairings/${pairing.id}/poll`)).json()).state, "pending");
  }
  assert.equal(events.filter((e) => e.type === "approve").length, 0);
}));

test("browser approval chooses account and workspace but only CLI polling completes login", () => withFixture(async ({ origin }) => {
  const pairing = await (await post(origin, "/clients/choice/login", { workspace: "ws-alpha" })).json();
  assert.equal(pairing.workspaceHint, "ws-alpha");
  assert.equal((await fetch(pairing.url)).status, 200);
  assert.equal((await post(origin, `/pairings/${pairing.id}/approve`, { account: "sam", workspace: "ws-beta" })).status, 200);
  assert.equal((await (await fetch(origin + "/clients/choice/status")).json()).account, null);
  assert.equal((await (await post(origin, `/pairings/${pairing.id}/poll`)).json()).state, "connected");
  const status = await (await fetch(origin + "/clients/choice/status")).json();
  assert.equal(status.account.email, "sam@example.invalid");
  assert.equal(status.workspaces.find((w) => w.selected).slug, "ws-beta");
  assert.equal((await post(origin, `/pairings/${pairing.id}/approve`, { account: "alex", workspace: "ws-alpha" })).status, 409);
}));

test("cancelled and expired requests cannot later approve and retry has a fresh code", async () => {
  let time = 0;
  await withFixture(async ({ origin }) => {
    const first = await (await post(origin, "/clients/retry/login")).json();
    assert.equal((await post(origin, `/pairings/${first.id}/cancel`)).status, 200);
    assert.equal((await post(origin, `/pairings/${first.id}/approve`, { account: "alex", workspace: "ws-alpha" })).status, 409);
    const second = await (await post(origin, "/clients/retry/login")).json();
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.code, second.code);
    time = 26;
    assert.equal((await (await post(origin, `/pairings/${second.id}/poll`)).json()).state, "expired");
    assert.equal((await post(origin, `/pairings/${second.id}/approve`, { account: "sam", workspace: "ws-beta" })).status, 409);
  }, { ttlMs: 25, now: () => time });
});

test("fake executable stays signed out until browser approval, then its detached finisher completes", () => withFixture(async ({ origin, notifications }) => {
  const env = { PATH: process.env.PATH, OC_PAIRING_FIXTURE_ORIGIN: origin, OC_PAIRING_FIXTURE_CLIENT: "cli" };
  const cli = async (...args) => (await execute("python3", [fake, ...args], { env })).stdout;
  assert.equal(JSON.parse(await cli("status", "--json")).account, null);
  const output = await cli("--workspace", "ws-beta", "login");
  const url = output.match(/http:\/\/127\.0\.0\.1:\d+\/cli\/connect\?request=[a-z0-9-]+/)[0];
  const id = new URL(url).searchParams.get("request");
  assert.equal(JSON.parse(await cli("status", "--json")).account, null);
  await cli("login");
  assert.equal(JSON.parse(await cli("status", "--json")).account, null);
  const finished = once(notifications, "completed", { signal: AbortSignal.timeout(5000) });
  await post(origin, `/pairings/${id}/approve`, { account: "sam", workspace: "ws-beta" });
  assert.deepEqual(await finished, ["cli"]);
  assert.equal(JSON.parse(await cli("status", "--json")).account.email, "sam@example.invalid");
  assert.match(await cli("login"), /Signed in/);
  await cli("logout");
  assert.equal(JSON.parse(await cli("status", "--json")).account, null);
}));

test("fixture rejects real authentication headers and invalid choices", () => withFixture(async ({ origin }) => {
  assert.equal((await fetch(origin + "/clients/guard/status", { headers: { Cookie: "synthetic-forbidden-cookie" } })).status, 400);
  const pairing = await (await post(origin, "/clients/guard/login")).json();
  assert.equal((await post(origin, `/pairings/${pairing.id}/approve`, { account: "not-a-fixture", workspace: "production" })).status, 400);
  assert.equal((await (await fetch(origin + `/pairings/${pairing.id}`)).json()).state, "pending");
}));

test("fake executable fails closed before any non-loopback request", async () => {
  await assert.rejects(execute("python3", [fake, "login"], { env: { PATH: process.env.PATH, OC_PAIRING_FIXTURE_ORIGIN: "https://reasonmachines.com", OC_PAIRING_FIXTURE_CLIENT: "guard" } }), /loopback HTTP origin/);
});
