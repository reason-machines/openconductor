import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path));
const text = (path) => read(path).toString("utf8");
const manifest = JSON.parse(text("scripts/app-brand-assets.json"));
// Tauri emits ICNS chunks in hash-map order; compare their bytes in type order.
function fingerprintBytes(asset) {
  const bytes = read(asset.path);
  if (asset.hashMode !== "icns-chunks") return bytes;
  assert.equal(bytes.subarray(0, 4).toString(), "icns");
  assert.equal(bytes.readUInt32BE(4), bytes.length);
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset + 4);
    assert(length >= 8 && offset + length <= bytes.length, "invalid ICNS chunk");
    chunks.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  return Buffer.concat(chunks.sort(Buffer.compare));
}
for (const asset of [...manifest.source, ...manifest.generated]) {
  const hash = createHash("sha256").update(fingerprintBytes(asset)).digest("hex");
  assert.equal(hash, asset.sha256, `${asset.path} differs from the pinned official source or generated icon; see docs/app-branding.md`);
}
const dimensions = new Map([
  ["src-tauri/icons/reason-app-icon-ink-1024.png", 1024],
  ["src-tauri/icons/32x32.png", 32],
  ["src-tauri/icons/64x64.png", 64],
  ["src-tauri/icons/128x128.png", 128],
  ["src-tauri/icons/128x128@2x.png", 256],
  ["public/icon.png", 128],
]);
for (const [path, size] of dimensions) {
  const png = read(path);
  assert.equal(png.subarray(1, 4).toString(), "PNG", path);
  assert.equal(png.readUInt32BE(16), size, `${path} width`);
  assert.equal(png.readUInt32BE(20), size, `${path} height`);
}
assert.deepEqual(read("public/icon.png"), read("src-tauri/icons/128x128.png"));
assert.match(text("index.html"), /type="image\/svg\+xml" href="\/favicon.svg"/);
assert.match(text("src/components/AppMark.tsx"), /\/app-brand\/reason-mark-mask\.svg/);
assert.match(text("src/components/Icons.tsx"), /AppMark as LogoMark/);
for (const path of ["src/onboarding/SignIn.tsx", "src/onboarding/FirstRunOnboarding.tsx"]) {
  assert.match(text(path), /<AppMark size=\{96\} \/>/, path);
}
assert.match(text("src/components/Sidebar.tsx"), /className="sb-app-mark"[^\n]*<AppMark size=\{14\}/);
assert.match(text("src/components/HomeScreen.tsx"), /<Wordmark \/>/);
assert.match(text("src/components/Wordmark.tsx"), /pixelWordmark\("OPENCONDUCTOR"\)/);
const config = JSON.parse(text("src-tauri/tauri.conf.json"));
for (const icon of config.bundle.icon) {
  assert(manifest.generated.some((asset) => asset.path === `src-tauri/${icon}`), `unverified bundle icon: ${icon}`);
}
assert.match(text("scripts/gen-icons.sh"), /tauri icon src-tauri\/icons\/reason-app-icon-ink-1024\.png/);
console.log(`Official app branding passed: ${manifest.source.length} source hashes, ${manifest.generated.length} generated hashes, PNG sizes, favicon/bundle/onboarding wiring, Home wordmark.`);
