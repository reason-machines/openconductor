import assert from "node:assert/strict";
import test from "node:test";
import { browserAddress, editedPreviewUrl, previewUrl } from "./model.ts";
import { browserSnapshot, closeBrowserPreview, openBrowserPreview, parkBrowserPreview, placeBrowserPreview, subscribeBrowser } from "./store.ts";

test("preview boundary accepts only credential-free HTTP(S) addresses", () => {
  for (const url of ["http://localhost:51000/a", "https://example.test/", "http://[::1]:51000/"]) assert.ok(previewUrl(url));
  assert.equal(previewUrl("http://localhost:1420/app", "http://localhost:1420"), null, "same-origin content cannot escape its scripts+same-origin sandbox");
  assert.ok(previewUrl("http://localhost:51000/", "http://localhost:1420"));
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///etc/hosts", "https://user:secret@example.test/", "http://localhost:51000/\n", "http://localhost:$PORT/"]) assert.equal(previewUrl(url), null);
});

test("address edits retain scheme and hostname while accepting port, path, query and hash", () => {
  const original = "http://localhost:51000/a?q=1#start";
  assert.deepEqual(browserAddress(original), { locked: "http://localhost", hostname: "localhost", rest: ":51000/a?q=1#start" });
  assert.equal(editedPreviewUrl(original, "51001/next?q=2#end"), "http://localhost:51001/next?q=2#end");
  assert.equal(editedPreviewUrl(original, "/next"), "http://localhost/next");
  assert.equal(editedPreviewUrl(original, ":99999/path"), null);
  assert.equal(editedPreviewUrl(original, ":51001@evil.test/"), null);
  assert.equal(editedPreviewUrl(original, ":51001\\@evil.test/"), "http://localhost:51001/@evil.test/");
});

test("one page per workspace, same URL reload, replace, close, and notification identity", () => {
  const a = "browser-model-a", b = "browser-model-b";
  closeBrowserPreview(a); closeBrowserPreview(b);
  let notifications = 0;
  const off = subscribeBrowser(() => notifications++);
  assert.equal(openBrowserPreview(a, "javascript:alert(1)"), false);
  assert.equal(notifications, 0);
  assert.equal(openBrowserPreview(a, "http://localhost:51001/A"), true);
  const first = browserSnapshot().pages.get(a);
  assert.ok(first);
  assert.equal(openBrowserPreview(a, first.url, false), true);
  assert.equal(browserSnapshot().pages.get(a), first);
  assert.equal(openBrowserPreview(a, first.url), true);
  assert.equal(browserSnapshot().pages.get(a)?.reload, 1);
  openBrowserPreview(b, "http://localhost:51002/B");
  openBrowserPreview(a, "http://localhost:51003/C");
  assert.equal(browserSnapshot().pages.get(a)?.url, "http://localhost:51003/C");
  assert.equal(browserSnapshot().pages.get(b)?.url, "http://localhost:51002/B");
  closeBrowserPreview(a);
  assert.equal(browserSnapshot().pages.has(a), false);
  assert.equal(browserSnapshot().pages.has(b), true);
  closeBrowserPreview(b); off();
});

test("late anchor cleanup cannot hide another workspace's current page", () => {
  const a = Symbol("A"), b = Symbol("B");
  const rect = { left: 10, top: 20, width: 800, height: 500 };
  placeBrowserPreview({ owner: a, workspaceId: "a", url: "http://localhost:51001/", rect });
  placeBrowserPreview({ owner: b, workspaceId: "b", url: "http://localhost:51002/", rect });
  const current = browserSnapshot();
  parkBrowserPreview(a);
  assert.equal(browserSnapshot(), current);
  placeBrowserPreview({ owner: b, workspaceId: "b", url: "http://localhost:51002/", rect });
  assert.equal(browserSnapshot(), current);
  parkBrowserPreview(b);
  assert.equal(browserSnapshot().placement, null);
});
