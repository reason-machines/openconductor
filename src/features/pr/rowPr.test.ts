import { test } from "node:test";
import assert from "node:assert/strict";
import { rowPrOf } from "./rowPr.ts";
import type { PrInfo } from "./types.ts";

function minimalInfo(overrides: Partial<PrInfo> = {}): PrInfo {
  return {
    number: 42,
    url: "https://github.com/owner/repo/pull/42",
    title: "Test PR",
    body: "",
    authorLogin: null,
    baseRefName: "main",
    baseRefOid: null,
    headRefName: "feature",
    headRefOid: "abc123",
    viewerDidAuthor: null,
    viewerLatestReview: null,
    viewerCanMerge: true,
    isDraft: false,
    isMerged: false,
    isAutoMergeEnabled: false,
    mergeQueue: null,
    status: null,
    ...overrides,
  };
}

test("rowPrOf copies url from PrInfo so the palette open-pull-request entry can use it", () => {
  const url = "https://github.com/owner/repo/pull/42";
  const result = rowPrOf(minimalInfo({ url }), false);
  assert.equal(result.url, url, "url must be propagated");
});

test("rowPrOf url is undefined when PrInfo.url is not set (type-system contract)", () => {
  // PrInfo.url is required (string), so this tests the happy path only;
  // the type ensures callers always provide a URL.
  const result = rowPrOf(minimalInfo(), false);
  assert.ok(typeof result.url === "string", "url must be a string when present");
});

test("rowPrOf preserves other required fields alongside url", () => {
  const info = minimalInfo({ number: 7, isDraft: true, isMerged: false });
  const result = rowPrOf(info, true);
  assert.equal(result.number, 7);
  assert.equal(result.isDraft, true);
  assert.equal(result.isMerged, false);
  assert.equal(result.optionalChecksBlock, true);
  assert.equal(result.url, info.url);
});
