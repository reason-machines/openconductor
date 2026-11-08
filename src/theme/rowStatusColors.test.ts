import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("row PR colours use the REA semantic tokens, not diff tints or opacity approximations", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const [color, token] of Object.entries({
    destructive: "destructive", merged: "status-row-merged", "in-progress": "conductor-status-in-progress",
    ready: "success", conflict: "status-row-conflict", "checks-pending": "diff-mod",
  })) {
    assert.ok(css.includes(`.sb-ws-status[data-color="${color}"] { color: var(--${token}); }`), color);
  }
  const tokens = readFileSync("src/theme/tokens.css", "utf8");
  assert.ok(tokens.includes("--status-row-merged: oklch(62.7% .265 303.9);"));
  assert.ok(tokens.includes("--status-row-conflict: #cca694;"));
  assert.equal((tokens.match(/--status-row-conflict: #ddc1b1;/g) ?? []).length, 2, "explicit and system dark modes");
});
