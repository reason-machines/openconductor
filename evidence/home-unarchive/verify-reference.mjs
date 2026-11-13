import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const receipt = JSON.parse(readFileSync(new URL("./reference-static.json", import.meta.url), "utf8"));
for (const excerpt of receipt.excerpts) {
  assert.equal(Buffer.byteLength(excerpt.source), excerpt.range[1] - excerpt.range[0], `${excerpt.symbol}: UTF-8 length`);
  assert.equal(createHash("sha256").update(excerpt.source).digest("hex"), excerpt.sha256, `${excerpt.symbol}: SHA-256`);
}
console.log(`Passed ${receipt.excerpts.length} excerpt byte lengths and SHA-256 digests. Full-asset digests remain owner receipts, not a local reread.`);
