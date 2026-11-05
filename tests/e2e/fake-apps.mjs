// Stand-in Mac app bundles for the Open button flow: `~/Applications/<App>.app`
// with an Info.plist naming its .icns, which is all OpenConductor's "installed"
// check and icon reader look at (src-tauri/src/open_in). The set is the apps of
// Sven's Mac "sven m5 max", the machine the Conductor reference menu describes.
//
// Icons: OC_E2E_ICNS_DIR may hold <id>.icns files copied from a Mac (kept out
// of the repository); otherwise each app gets a one-colour 64 px PNG icon.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

export const FAKE_APPS = [
  // [catalog id, bundle name, CFBundleIconFile, colour]
  ["finder", "Finder", "Finder", [38, 132, 255]],
  ["cursor", "Cursor", "Cursor.icns", [30, 30, 30]],
  ["vscode", "Visual Studio Code", "Code.icns", [0, 122, 204]],
  ["zed", "Zed", "Zed.icns", [70, 70, 90]],
  ["xcode", "Xcode", "Xcode", [20, 140, 240]],
  ["ghostty", "Ghostty", "Ghostty", [40, 60, 160]],
  ["terminal", "Terminal", "Terminal", [50, 50, 50]],
];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A `size` x `size` PNG of one colour with rounded-off corners. */
function png(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = [];
  const radius = size / 5;
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
      row.push(r, g, b, dx * dx + dy * dy <= radius * radius ? 255 : 0);
    }
    rows.push(Buffer.from(row));
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

/** An .icns file with one PNG entry (`ic11`, 32 pt @2x = 64 px). */
function icns(pngBytes) {
  const entry = Buffer.alloc(8);
  entry.write("ic11", 0, "latin1");
  entry.writeUInt32BE(pngBytes.length + 8, 4);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "latin1");
  head.writeUInt32BE(pngBytes.length + 16, 4);
  return Buffer.concat([head, entry, pngBytes]);
}

const plist = (iconFile) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIconFile</key><string>${iconFile}</string></dict></plist>
`;

/** Creates the bundles that do not exist yet under `home/Applications`; returns their remover. */
export function installFakeApps(home, icnsDir = process.env.OC_E2E_ICNS_DIR) {
  const made = [];
  for (const [id, name, iconFile, colour] of FAKE_APPS) {
    const bundle = join(home, "Applications", `${name}.app`);
    if (existsSync(bundle)) continue;
    const resources = join(bundle, "Contents", "Resources");
    mkdirSync(resources, { recursive: true });
    made.push(bundle);
    writeFileSync(join(bundle, "Contents", "Info.plist"), plist(iconFile));
    const real = icnsDir && join(icnsDir, `${id}.icns`);
    const bytes = real && existsSync(real) ? readFileSync(real) : icns(png(64, colour));
    writeFileSync(join(resources, iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`), bytes);
  }
  return () => {
    for (const bundle of made) rmSync(bundle, { recursive: true, force: true });
  };
}
