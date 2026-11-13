import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { get } from "node:http";
import { createAgentBinaryReleaseFixture } from "../../tools/e2e/agent-binary-release-fixture.mjs";
import { finishStartup, waitForSetup } from "./startup.mjs";
import { WebDriver } from "./webdriver.mjs";

function fixture(t, states) {
  const events = [];
  let index = 0;
  let current;
  const wd = new WebDriver();
  wd.sessionId = "startup-fixture";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("/execute/sync")) {
      const { script } = JSON.parse(options.body);
      current = states[Math.min(index++, states.length - 1)];
      if (current instanceof Error) throw current;
      const document = { querySelector(selector) {
        if (selector === '[data-testid="reason-cli-status"][data-state="error"]') return current.error ? { getAttribute: (name) => name === "title" ? current.error : null } : null;
        if (selector === '[data-testid="reason-cli-status"][data-state="installing"]') return current.setup ? {} : null;
        if (selector === ".onb .onb-continue:not(:disabled)") return current.onboarding ? {} : null;
        if (selector === ".app") return current.app ? { dataset: { startup: current.startup ?? "ready" }, getAttribute: () => current.busy ?? "false" } : null;
        throw new Error(`unexpected selector: ${selector}`);
      } };
      const value = new Function("document", script)(document);
      events.push(value);
      return Response.json({ value });
    }
    if (url.endsWith("/elements")) {
      assert.equal(JSON.parse(options.body).value, ".onb .onb-continue:not(:disabled)");
      return Response.json({ value: current.onboarding ? [{ "element-6066-11e4-a52e-4f735466cecf": "continue" }] : [] });
    }
    if (url.endsWith("/element/continue/click")) {
      events.push("continue");
      return Response.json({ value: null });
    }
    throw new Error(`unexpected request: ${url}`);
  });
  return { wd, events, reads: () => index };
}

test("fresh startup waits for setup, runs the fixture hook, and explicitly continues before shell readiness", async (t) => {
  const { wd, events } = fixture(t, [{}, { setup: true }, {}, { onboarding: true }, { app: true, startup: "loading", busy: "true" }, { app: true }]);
  await finishStartup(wd, { afterSetup: () => events.push("fixture") });
  const hook = events.indexOf("fixture");
  assert.ok(hook > 0);
  assert.equal(events[hook - 1].onboarding, true);
  assert.equal(events[hook + 1], "continue");
  assert.deepEqual(events.at(-1), { startup: "ready", busy: "false" });
});

test("a shell-only wait stalls on the first-run screen; the startup helper continues it", async (t) => {
  const blocked = fixture(t, [{ onboarding: true }]);
  await assert.rejects(blocked.wd.waitForAppReady(20), /timed out waiting for app startup/);
  const { wd, events } = fixture(t, [{ onboarding: true }, { app: true }]);
  await finishStartup(wd);
  assert.ok(events.includes("continue"));
  assert.deepEqual(events.at(-1), { startup: "ready", busy: "false" });
});

test("existing-install startup still waits for setup but does not click onboarding", async (t) => {
  const { wd, events } = fixture(t, [{ setup: true }, { app: true }, { app: true }]);
  await finishStartup(wd);
  assert.ok(!events.includes("continue"));
  assert.deepEqual(events.at(-1), { startup: "ready", busy: "false" });
});

test("setup failure is immediate, with no retry, fixture hook or Continue", async (t) => {
  const { wd, events, reads } = fixture(t, [{ setup: true, error: "official download unavailable" }, { onboarding: true }]);
  await assert.rejects(finishStartup(wd, { afterSetup: () => events.push("fixture") }), /Reason CLI setup failed: official download unavailable/);
  assert.equal(reads(), 1);
  assert.ok(!events.includes("fixture"));
  assert.ok(!events.includes("continue"));
});

test("a leftover shell cannot bypass an active setup gate", async (t) => {
  const { wd, events } = fixture(t, [{ setup: true, app: true }, { onboarding: true }, { app: true }]);
  await finishStartup(wd);
  assert.equal(events[1].onboarding, true);
  assert.equal(events[2], "continue");
});

test("navigation transport errors are retried while waiting for setup", async (t) => {
  const { wd, events } = fixture(t, [new Error("navigation in progress"), { onboarding: true }, { app: true }]);
  await finishStartup(wd);
  assert.ok(events.includes("continue"));
});

test("setup wait can stop at onboarding without continuing it", async (t) => {
  const { wd, events } = fixture(t, [{ onboarding: true }]);
  assert.equal((await waitForSetup(wd)).onboarding, true);
  assert.equal(events.length, 1);
});

test("fixture hook failure does not continue onboarding", async (t) => {
  const { wd, events } = fixture(t, [{ onboarding: true }]);
  await assert.rejects(finishStartup(wd, { afterSetup: () => { throw new Error("fixture copy failed"); } }), /fixture copy failed/);
  assert.ok(!events.includes("continue"));
});

test("an asynchronous fixture hook is awaited before Continue", async (t) => {
  const { wd, events } = fixture(t, [{ onboarding: true }, { app: true }]);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const startup = finishStartup(wd, { afterSetup: async () => {
    events.push("fixture-start");
    await blocked;
    events.push("fixture-ready");
  } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(events.includes("fixture-start"));
  assert.ok(!events.includes("continue"));
  release();
  await startup;
  assert.ok(events.indexOf("continue") > events.indexOf("fixture-ready"));
});

test("a missing Continue fails instead of silently skipping onboarding", async (t) => {
  const { wd } = fixture(t, [{ onboarding: true }]);
  t.mock.method(wd, "findAll", async () => []);
  await assert.rejects(finishStartup(wd), /Continue disappeared/);
});

test("a stalled setup request is cancelled at the setup deadline", async (t) => {
  const wd = new WebDriver();
  wd.sessionId = "stalled-fixture";
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        aborted = true;
        reject(options.signal.reason);
      }, { once: true });
    });
    return Response.json({ value: null });
  });
  await assert.rejects(finishStartup(wd, { timeoutMs: 20 }), /timed out waiting for Reason CLI setup/);
  assert.equal(aborted, true);
});

test("shell startup failures remain failures after setup", async (t) => {
  const { wd } = fixture(t, [{ onboarding: true }, { app: true, startup: "error" }]);
  await assert.rejects(finishStartup(wd), /app startup failed/);
});

function binaryResponse(server) {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${server.address().port}/claude`, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function binaryReleaseFixture(t) {
  const release = createAgentBinaryReleaseFixture(Buffer.from("fixture binary"));
  await new Promise((resolve) => release.server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    release.server.closeAllConnections();
    release.server.close();
  });
  return release;
}

test("binary auto-retry's first 404 waits until the post-reload observer is ready", async (t) => {
  const release = await binaryReleaseFixture(t);
  let response;
  let observerReady = false;
  let readyWhenAnswered;
  await release.holdFailuresUntil(async () => {
    const request = once(release.server, "request");
    response = binaryResponse(release.server).then((status) => {
      readyWhenAnswered = observerReady;
      return status;
    });
    const [, res] = await request;
    assert.equal(res.writableEnded, false, "the release fixture must hold its response while startup is unfinished");
    assert.equal(release.requests[0].finished, false);
    observerReady = true;
  });
  assert.equal(await response, 404);
  assert.equal(readyWhenAnswered, true, "a fast 404 must not start the retry countdown during startup");
  assert.equal(await binaryResponse(release.server), 404);
  assert.equal(await binaryResponse(release.server), 404);
  assert.equal(release.requests.length, 3, "all three original failure attempts still reach the same HTTP fixture");
  assert.ok(release.requests.every((request) => request.finished && request.status === 404));
});

test("binary release responses are released when startup throws", async (t) => {
  const release = await binaryReleaseFixture(t);
  let response;
  await assert.rejects(release.holdFailuresUntil(async () => {
    const request = once(release.server, "request");
    response = binaryResponse(release.server);
    await request;
    throw new Error("startup failed");
  }), /startup failed/);
  assert.equal(await response, 404);
  assert.equal(await binaryResponse(release.server), 404, "a later request cannot inherit an abandoned startup barrier");
});

test("a stuck installer has a bounded diagnostic timeout", async (t) => {
  const { wd } = fixture(t, [{ setup: true }]);
  await assert.rejects(finishStartup(wd, { timeoutMs: 20 }), /timed out waiting for Reason CLI setup.*"setup":true/);
});
