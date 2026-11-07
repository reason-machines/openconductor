import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "oc-settings-defaults-"));
const bundle = join(dir, "fixture.cjs");
const runtime = createRequire(import.meta.url).resolve("react/jsx-runtime");
after(() => rmSync(dir, { recursive: true, force: true }));
await build({
  entryPoints: [join(root, "scripts/settings-defaults-fixture.mjs")],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  outfile: bundle,
  banner: { js: "globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };" },
  plugins: [{
    name: "observe-host-controls",
    setup(builder) {
      builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: "runtime", namespace: "observe-jsx" }));
      builder.onResolve({ filter: /.*/, namespace: "observe-jsx" }, args => ({ path: args.path, external: true }));
      builder.onLoad({ filter: /.*/, namespace: "observe-jsx" }, () => ({
        contents: `import { jsx as realJsx, jsxs as realJsxs, Fragment } from ${JSON.stringify(runtime)};
          export { Fragment };
          const observe = (type, props) => { if (type === 'select' && props['aria-label']) globalThis.__captureSettingsSelect?.(props); };
          export function jsx(type, props, key) { observe(type, props); return realJsx(type, props, key); }
          export function jsxs(type, props, key) { observe(type, props); return realJsxs(type, props, key); }`,
        loader: "js",
      }));
      builder.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: "empty-css" }));
      builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "", loader: "js" }));
    },
  }],
});

for (const scenario of ["same-render", "older-reply", "partial-render", "separate-renders"]) {
  test(`Reason defaults keep all clears with ${scenario} handlers and delayed settings IPC`, () => {
    const result = spawnSync(process.execPath, [bundle, scenario], {
      cwd: root,
      env: { ...process.env, NODE_PATH: join(root, "node_modules") },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}
