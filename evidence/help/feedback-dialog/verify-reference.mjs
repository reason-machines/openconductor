import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const packet = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url), "utf8"));
for (const excerpt of packet.excerpts) {
  const bytes = Buffer.from(excerpt.source, "utf8");
  assert.equal(bytes.length, excerpt.utf8_half_open[1] - excerpt.utf8_half_open[0], excerpt.name);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), excerpt.sha256, excerpt.name);
}
console.log(`PASS: ${packet.excerpts.length} retained excerpt byte lengths and SHA-256 identities; no reference code executed.`);
