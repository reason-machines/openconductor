import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { homeStatus, rowStatusColor, showsActivityStatus } from "../state/rowStatus.ts";

test("Home failed activity uses the destructive token without recolouring deleted lines", () => {
  const status = homeStatus("failed", "idle");
  assert.equal(status, "failed");
  assert.equal(showsActivityStatus(status), true);
  assert.equal(rowStatusColor(status), "destructive");
  const css = readFileSync(new URL("../home.css", import.meta.url), "utf8");
  assert.match(css, /\.allws-status\[data-color="destructive"\]\s*\{\s*color:\s*var\(--destructive\);\s*\}/);
  assert.match(css, /\.allws-diff\s+\.del\s*\{\s*color:\s*var\(--diff-del\);\s*\}/);
});
