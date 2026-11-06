import assert from "node:assert/strict";
import test from "node:test";
import { WebDriver } from "./webdriver.mjs";

test("startup waits through a missing shell, loading, and busy ready state", async (t) => {
  const states = [null, { startup: "loading", busy: "true" }, { startup: "ready", busy: "true" }, { startup: "ready", busy: "false" }];
  const wd = new WebDriver();
  wd.sessionId = "fixture";
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { script } = JSON.parse(options.body);
    const state = states[reads++];
    const document = { querySelector: (selector) => {
      assert.equal(selector, ".app");
      return state && { dataset: { startup: state.startup }, getAttribute: (name) => {
        assert.equal(name, "aria-busy");
        return state.busy;
      } };
    } };
    const value = new Function("document", script)(document);
    return Response.json({ value });
  });
  await wd.waitForAppReady();
  assert.equal(reads, 4);
});

test("startup errors fail before any later ready state", async (t) => {
  const wd = new WebDriver();
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => {
    reads++;
    return Response.json({ value: { startup: "error", busy: "false" } });
  });
  await assert.rejects(wd.waitForAppReady(), /app startup failed/);
  assert.equal(reads, 1);
});

test("startup cancels a stalled readiness request at its deadline", async (t) => {
  const wd = new WebDriver();
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
  await assert.rejects(wd.waitForAppReady(20), /timed out waiting for app startup/);
  assert.equal(aborted, true);
});

for (const stalledStage of ["repaint setup", "capture", "repaint cleanup"]) {
  test(`screenshot bounds a stalled ${stalledStage} request`, async (t) => {
    const stages = ["repaint setup", "capture", "repaint cleanup"];
    const png = Buffer.from("fixture PNG");
    let requests = 0;
    let aborted = false;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      const stage = stages[requests++];
      if (stage === stalledStage) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 200);
          const abort = () => {
            clearTimeout(timer);
            aborted = true;
            reject(options.signal.reason);
          };
          if (options.signal?.aborted) abort();
          else options.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      return new Response(JSON.stringify({ value: stage === "capture" ? png.toString("base64") : null }));
    });
    const wd = new WebDriver();
    wd.sessionId = "fixture";
    if (stalledStage === "repaint cleanup") {
      assert.deepEqual(await wd.screenshot(20), png);
    } else {
      await assert.rejects(wd.screenshot(20), /screenshot timed out after 20 ms/);
    }
    assert.equal(aborted, true, "the stalled request is cancelled, not left pending");
    assert.equal(requests, stalledStage === "repaint setup" ? 2 : 3, "repaint cleanup is attempted even after a failure");
  });
}
