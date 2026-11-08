import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rowStatus, rowStatusColor, type RowPr } from "../state/rowStatus.ts";

const pr = (over: Partial<RowPr> = {}): RowPr => ({
  number: 7, isMerged: false, isDraft: false, inMergeQueue: false,
  mergeState: "BLOCKED", checks: "passing", failingChecks: 0, viewerCanMerge: true, ...over,
});

const cases = [
  { name: "no PR, remote", input: { hasRemote: true }, status: "branch", color: "muted" },
  { name: "no PR, local", input: { hasRemote: false }, status: "local", color: "muted" },
  { name: "closed PR discarded by lookup", input: { hasRemote: true, pr: null }, status: "branch", color: "muted" },
  { name: "open PR", input: { pr: pr() }, status: "open-pr", color: "muted" },
  { name: "draft PR", input: { pr: pr({ isDraft: true, mergeState: "CLEAN" }) }, status: "draft-pr", color: "muted" },
  { name: "merged PR", input: { pr: pr({ isMerged: true }) }, status: "merged", color: "merged" },
  { name: "merge-ready open PR", input: { pr: pr({ mergeState: "CLEAN" }) }, status: "ready-to-merge", color: "ready" },
] as const;

test("real row SVGs preserve PR states and use the branch glyph for both no-PR fallbacks", async () => {
  mkdirSync("node_modules/.cache", { recursive: true });
  const dir = mkdtempSync("node_modules/.cache/row-icons-");
  const outfile = resolve(dir, "icons.mjs");
  try {
    buildSync({ entryPoints: ["src/components/RowStatusIcon.tsx"], outfile, bundle: true, format: "esm", platform: "node", packages: "external", jsx: "automatic" });
    const { RowStatusIcon } = await import(pathToFileURL(outfile).href);
    for (const item of cases) {
      const status = rowStatus(item.input);
      assert.equal(status, item.status, item.name);
      assert.equal(rowStatusColor(status), item.color, item.name);
      const svg = renderToStaticMarkup(createElement(RowStatusIcon, { status }));
      assert.match(svg, /viewBox="0 0 24 24"/, item.name);
      assert.match(svg, /width="14" height="14"/, item.name);
      if (status === "branch" || status === "local") {
        assert.match(svg, /M15 6a9 9 0 0 0-9 9V3/, item.name);
        assert.match(svg, /cx="18" cy="6" r="3"/, item.name);
        assert.match(svg, /cx="6" cy="18" r="3"/, item.name);
        assert.doesNotMatch(svg, /M10 16h\.01/, item.name);
      } else if (status === "draft-pr") assert.match(svg, /M18 6V5/, item.name);
      else if (status === "merged") assert.match(svg, /M6 21V9a9 9 0 0 0 9 9/, item.name);
      else if (status === "open-pr") assert.match(svg, /M13 6h3a2 2 0 0 1 2 2v7/, item.name);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

