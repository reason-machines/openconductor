// Tests for useWindowDragDrop: hook wiring and nativePathToFile conversion.
// Loaded with runInNewContext so Tauri/backend imports can be mocked without
// requiring the native runtime.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test, describe } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const ts = dependencies("typescript");
const root = resolve(process.env.USE_WINDOW_DRAG_DROP_SOURCE_ROOT ?? ".");

function loadHook(): { nativePathToFile: (path: string) => Promise<{ name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } | null> } {
  const path = "src/features/chat/useWindowDragDrop.ts";
  const source = readFileSync(resolve(root, path), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const imports: Record<string, unknown> = {
    "react": { useEffect: () => {}, useRef: (init: unknown) => ({ current: init }), useState: (init: unknown) => [init, () => {}] },
    "@tauri-apps/api/webview": { getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) },
    "@tauri-apps/api/core": { convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}` },
    "../../backend": { inTauri: () => false },
  };
  function require(name: string): unknown {
    const resolved = imports[name];
    if (resolved !== undefined) return resolved;
    throw new Error(`Unexpected import in useWindowDragDrop test: ${name}`);
  }
  // Wrap fetch so tests can patch globalThis.fetch after module load.
  const fetchProxy = (...args: Parameters<typeof fetch>) => (globalThis.fetch as typeof fetch)(...args);
  runInNewContext(
    `(function(require, module, exports) {\n${javascript}\n})`,
    { fetch: fetchProxy, console },
    { filename: path },
  )(require, mod, mod.exports);
  return mod.exports as ReturnType<typeof loadHook>;
}

describe("nativePathToFile", () => {
  const { nativePathToFile } = loadHook();

  test("extracts basename from posix path and returns file bytes", async () => {
    const bytes = new TextEncoder().encode("hello world");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }) as Response;
    try {
      const file = await nativePathToFile("/Users/sven/docs/readme.md");
      assert.ok(file !== null, "file should not be null for a successful fetch");
      assert.equal(file!.name, "readme.md");
      assert.equal(file!.size, bytes.byteLength);
      const buf = await file!.arrayBuffer();
      assert.deepEqual(new Uint8Array(buf), bytes);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("extracts basename from windows path", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }) as Response;
    try {
      const file = await nativePathToFile("C:\\Users\\sven\\file.txt");
      assert.ok(file !== null);
      assert.equal(file!.name, "file.txt");
      assert.equal(file!.size, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null when fetch responds not ok", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 403 }) as Response;
    try {
      const file = await nativePathToFile("/restricted/secret.pem");
      assert.equal(file, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns null when fetch throws", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("network error"); };
    try {
      const file = await nativePathToFile("/missing/file.txt");
      assert.equal(file, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses full path as name when no separator present", async () => {
    const bytes = new Uint8Array([42]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }) as Response;
    try {
      const file = await nativePathToFile("plainfile");
      assert.ok(file !== null);
      assert.equal(file!.name, "plainfile");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// Note: useWindowDragDrop depends on React hooks and @tauri-apps/api/webview which
// require the Tauri runtime. Event-dispatch coverage is left for E2E / native acceptance.
// NATIVE_NOT_RUN: live overlay, keyboard shortcuts, actual file bytes in a signed build.
