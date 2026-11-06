import { test } from "node:test";
import assert from "node:assert/strict";
import { prLinkMenu, prUrlFor } from "./prLinkMenuItems.ts";

const URL = "https://github.com/acme/web/pull/42";

test("default target first with the other targets after it, then Copy link and Copy number", () => {
  assert.deepEqual(
    prLinkMenu(URL, 42, "github").map((i) => i.label),
    ["Open in GitHub", "Open in Linear", "Open in Graphite", "Copy link", "Copy number"],
  );
  assert.deepEqual(
    prLinkMenu(URL, 42, "graphite").map((i) => i.label),
    ["Open in Graphite", "Open in GitHub", "Open in Linear", "Copy link", "Copy number"],
  );
});

test("targets rewrite the GitHub URL", () => {
  assert.equal(prUrlFor(URL, "linear"), "https://linear.review/acme/web/pull/42");
  assert.equal(prUrlFor(`${URL}/files`, "graphite"), "https://app.graphite.com/github/pr/acme/web/42");
});

test("a non-GitHub PR gets one open item and copies the URL and number", () => {
  const items = prLinkMenu("https://gitlab.example/acme/web/-/merge_requests/7", 7, "linear", "other");
  assert.deepEqual(items.map((i) => i.label), ["Open remote", "Copy link", "Copy number"]);
  assert.equal(items[0].kind === "open" && items[0].url, "https://gitlab.example/acme/web/-/merge_requests/7");
  assert.equal(items[2].kind === "copy-number" && items[2].text, "7");
});
