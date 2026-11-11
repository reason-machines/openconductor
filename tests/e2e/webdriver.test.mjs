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

for (const [operation, method, path, value] of [
  [(wd) => wd.execute("return 'private-fixture-value'"), "POST", "/execute/sync", null],
  [(wd) => wd.findAll(".fixture"), "POST", "/elements", []],
  [(wd) => wd.click("fixture"), "POST", "/element/fixture/click", null],
  [(wd) => wd.keys("private-fixture-value"), "POST", "/actions", null],
  [(wd) => wd.deleteSession(), "DELETE", "", null],
]) {
  test(`ordinary ${method} ${path || "session"} cancels a stalled request`, async (t) => {
    let aborted = false;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          aborted = true;
          reject(options.signal.reason);
        }, { once: true });
      });
      return Response.json({ value });
    });
    const wd = new WebDriver("http://127.0.0.1:4444", 20);
    wd.sessionId = "fixture";
    if (method === "DELETE") {
      await operation(wd);
      assert.equal(wd.sessionId, null);
    } else {
      await assert.rejects(operation(wd), (error) => {
        assert.equal(error.name, "TimeoutError");
        assert.ok(error.message.includes(`${method} /session/fixture${path}`));
        assert.match(error.message, /timed out after 20 ms/);
        assert.ok(!error.message.includes("private-fixture-value"));
        return true;
      });
    }
    assert.equal(aborted, true, "the transport request must be cancelled, not left pending");
  });
}

test("session creation has the existing built-app client's 45-second launch budget", async (t) => {
  const deadlines = [];
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (ms) => {
    deadlines.push(ms);
    return timeout(ms);
  });
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("/session")) return Response.json({ value: { sessionId: "launched" } });
    return Response.json({ value: "ready" });
  });
  const wd = new WebDriver();
  await wd.newSession("/fixture/app");
  assert.equal(wd.sessionId, "launched");
  assert.equal(await wd.title(), "ready");
  assert.deepEqual(deadlines, [45000, 30000]);
});

test("session creation can outlast ordinary requests without disabling its deadline", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 40);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(options.signal.reason);
      }, { once: true });
    });
    return Response.json({ value: { sessionId: "launched" } });
  });
  const wd = new WebDriver("http://127.0.0.1:4444", 20);
  await wd.newSession("/fixture/app", 200);
  assert.equal(wd.sessionId, "launched");
});

test("stalled session creation cancels at its explicit launch deadline", async (t) => {
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 100);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        aborted = true;
        reject(options.signal.reason);
      }, { once: true });
    });
    return Response.json({ value: { sessionId: "late" } });
  });
  const wd = new WebDriver();
  await assert.rejects(wd.newSession("/fixture/app", 20), (error) => {
    assert.equal(error.name, "TimeoutError");
    assert.match(error.message, /POST \/session timed out after 20 ms/);
    return true;
  });
  assert.equal(aborted, true);
  assert.equal(wd.sessionId, null);
});

test("a failed transport names its operation, preserves its cause, and omits the request body", async (t) => {
  const cause = new TypeError("fetch failed");
  t.mock.method(globalThis, "fetch", async () => { throw cause; });
  const wd = new WebDriver();
  wd.sessionId = "fixture";
  await assert.rejects(wd.keys("private-fixture-value"), (error) => {
    assert.match(error.message, /POST \/session\/fixture\/actions.*fetch failed/);
    assert.equal(error.cause, cause);
    assert.ok(!error.message.includes("private-fixture-value"));
    return true;
  });
});

test("explicit execution deadlines allow a command longer than the default deadline", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 40);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(options.signal.reason);
      }, { once: true });
    });
    return Response.json({ value: "completed" });
  });
  const wd = new WebDriver("http://127.0.0.1:4444", 20);
  assert.equal(await wd.execute("return 'completed'", [], 200), "completed");
});

test("WebDriver protocol errors retain their status and explanation", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    value: { error: "invalid session id", message: "fixture session expired" },
  }, { status: 404 }));
  const wd = new WebDriver();
  wd.sessionId = "fixture";
  await assert.rejects(wd.findAll(".fixture"), /POST \/session\/fixture\/elements -> 404 invalid session id: fixture session expired/);
});

test("malformed response bodies fail with their operation instead of returning undefined", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("not JSON"));
  const wd = new WebDriver();
  wd.sessionId = "fixture";
  await assert.rejects(wd.execute("return null"), /POST \/session\/fixture\/execute\/sync transport failed/);
});

test("a stalled response body is cancelled and cannot become a successful empty result", async (t) => {
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => ({
    ok: true,
    json: () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ value: null }), 100);
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        aborted = true;
        reject(options.signal.reason);
      }, { once: true });
    }),
  }));
  const wd = new WebDriver("http://127.0.0.1:4444", 20);
  wd.sessionId = "fixture";
  await assert.rejects(wd.execute("return null"), /POST \/session\/fixture\/execute\/sync.*timed out after 20 ms/);
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
