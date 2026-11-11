import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const packet = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url), "utf8"));
assert.equal(packet.asset_locks.renderer, "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde");
assert.equal(packet.spans.length, 5);
for (const span of packet.spans) {
  const bytes = Buffer.from(span.source, "utf8");
  assert.equal(bytes.length, span.bytes, span.name);
  assert.equal(bytes.length, span.utf8_half_open[1] - span.utf8_half_open[0], span.name);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), span.sha256, span.name);
}
console.log("Passed all 5 retained GitHub owner source byte-length and SHA-256 checks; no source executed.");
