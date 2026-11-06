import { test } from "node:test";
import assert from "node:assert/strict";
import { movePreviewRow, previewRows, previewValue, splitPath } from "./repoMisc.ts";

test("Preview URLs always show one row, even with nothing saved", () => {
  assert.deepEqual(
    previewRows(undefined).map(({ name, url }) => ({ name, url })),
    [{ name: "", url: "" }],
  );
});

test("Preview URLs save trimmed rows with a URL and clear the setting when none is left", () => {
  const rows = previewRows([{ name: "App", url: "http://localhost:$CONDUCTOR_PORT" }]);
  rows.push({ id: "x", name: " Docs ", url: " http://localhost:$((CONDUCTOR_PORT + 1)) " }, { id: "y", name: "No url", url: "  " });
  assert.deepEqual(previewValue(rows), [
    { name: "App", url: "http://localhost:$CONDUCTOR_PORT" },
    { name: "Docs", url: "http://localhost:$((CONDUCTOR_PORT + 1))" },
  ]);
  assert.equal(previewValue([{ id: "z", name: "only a name", url: "" }]), null);
});

test("Preview URL rows move up or down and ignore moves past the ends", () => {
  const rows = previewRows([{ url: "a" }, { url: "b" }]);
  assert.deepEqual(movePreviewRow(rows, 1, -1).map((r) => r.url), ["b", "a"]);
  assert.deepEqual(movePreviewRow(rows, 0, -1).map((r) => r.url), ["a", "b"]);
});

test("splitPath splits the last segment off, as Conductor shows paths", () => {
  assert.deepEqual(splitPath("/Users/demo/code/tide-web"), { directory: "/Users/demo/code/", fileName: "tide-web" });
  assert.deepEqual(splitPath("tide-web"), { directory: "", fileName: "tide-web" });
});
