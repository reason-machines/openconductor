import assert from "node:assert/strict";
import test from "node:test";
import { WebDriver } from "./webdriver.mjs";

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
