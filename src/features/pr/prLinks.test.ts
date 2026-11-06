// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { copiedPrToast, prOpenItems, prUrlFor } from "./prLinks.ts";

const PR = "https://github.com/acme/tide/pull/42";

test("a github.com PR opens on GitHub, Linear's review site or Graphite", () => {
  assert.equal(prUrlFor(PR, "github"), PR);
  assert.equal(prUrlFor(PR, "linear"), "https://linear.review/acme/tide/pull/42");
  assert.equal(prUrlFor(`${PR}/files?x=1`, "graphite"), "https://app.graphite.com/github/pr/acme/tide/42");
});

test("the menu leads with the setting's site, then the other two", () => {
  assert.deepEqual(
    prOpenItems(PR, "graphite").map((i) => [i.label, i.primary]),
    [
      ["Open in Graphite", true],
      ["Open in GitHub", false],
      ["Open in Linear", false],
    ],
  );
  assert.deepEqual(prOpenItems(PR, "github")[0], { label: "Open in GitHub", url: PR, primary: true });
});

test("a PR off github.com has one Open remote item at its own URL", () => {
  const gl = "https://gitlab.com/acme/tide/-/merge_requests/7";
  assert.deepEqual(prOpenItems(gl, "linear"), [{ label: "Open remote", url: gl, primary: true }]);
  assert.equal(prUrlFor(gl, "graphite"), gl);
});

test("copy toasts", () => {
  assert.equal(copiedPrToast("link"), "Copied PR link to clipboard");
  assert.equal(copiedPrToast("number"), "Copied PR number to clipboard");
});
