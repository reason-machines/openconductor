// Tests for useWindowDragDrop: hook wiring and nativePathToFile conversion.
// Loaded with runInNewContext so Tauri/backend imports can be mocked without
// requiring the native runtime.
//
// GAP-CHAT-01 regression suite: verifies nativePathToFile uses plugin:fs|read_file
// (mocked via @tauri-apps/plugin-fs) and NOT fetch(convertFileSrc).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test, describe } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const ts = dependencies("typescript");
const root = resolve(process.env.USE_WINDOW_DRAG_DROP_SOURCE_ROOT ?? ".");

type FsRead = (path: string) => Promise<Uint8Array>;
type NativePathToFile = (path: string) => Promise<{ name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } | null>;

/** Mutable container that the sandbox's readFile delegates to, swapped per test. */
const fsReadRef: { impl: FsRead } = { impl: async () => new Uint8Array() };

function loadHook(): { nativePathToFile: NativePathToFile } {
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
    // Delegate to fsReadRef so tests can swap the implementation without reloading the module.
    "@tauri-apps/plugin-fs": { readFile: (p: string) => fsReadRef.impl(p) },
    "../../backend": { inTauri: () => false },
  };
  function require(name: string): unknown {
    const resolved = imports[name];
    if (resolved !== undefined) return resolved;
    throw new Error(`Unexpected import in useWindowDragDrop test: ${name}`);
  }
  runInNewContext(
    `(function(require, module, exports) {\n${javascript}\n})`,
    { console },
    { filename: path },
  )(require, mod, mod.exports);
  return mod.exports as ReturnType<typeof loadHook>;
}

describe("nativePathToFile", () => {
  const { nativePathToFile } = loadHook();

  test("extracts basename from posix path and returns file bytes", async () => {
    const bytes = new TextEncoder().encode("hello world");
    fsReadRef.impl = async () => bytes;
    const file = await nativePathToFile("/Users/sven/docs/readme.md");
    assert.ok(file !== null, "file should not be null for a successful read");
    assert.equal(file!.name, "readme.md");
    assert.equal(file!.size, bytes.byteLength);
    const buf = await file!.arrayBuffer();
    assert.deepEqual(new Uint8Array(buf), bytes);
  });

  test("extracts basename from windows path", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    fsReadRef.impl = async () => bytes;
    const file = await nativePathToFile("C:\\Users\\sven\\file.txt");
    assert.ok(file !== null);
    assert.equal(file!.name, "file.txt");
    assert.equal(file!.size, 3);
  });

  test("returns null when readFile throws (permission denied / path missing)", async () => {
    fsReadRef.impl = async () => { throw new Error("fs:deny"); };
    const file = await nativePathToFile("/restricted/secret.pem");
    assert.equal(file, null);
  });

  test("returns null when readFile throws with not-found error", async () => {
    fsReadRef.impl = async () => { throw new Error("not found"); };
    const file = await nativePathToFile("/missing/file.txt");
    assert.equal(file, null);
  });

  test("uses full path as name when no separator present", async () => {
    const bytes = new Uint8Array([42]);
    fsReadRef.impl = async () => bytes;
    const file = await nativePathToFile("plainfile");
    assert.ok(file !== null);
    assert.equal(file!.name, "plainfile");
  });

  test("does NOT use fetch or convertFileSrc (IPC-only path, regression guard)", async () => {
    // Guard: if globalThis.fetch is called, the implementation regressed to fetch(convertFileSrc).
    const bytes = new Uint8Array([7]);
    fsReadRef.impl = async () => bytes;
    const badFetch = async () => { throw new Error("fetch must not be called: use plugin:fs|read_file instead"); };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = badFetch as typeof fetch;
    try {
      const file = await nativePathToFile("/any/file.bin");
      assert.ok(file !== null, "should succeed via IPC path without fetch");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// Note: useWindowDragDrop depends on React hooks and @tauri-apps/api/webview which
// require the Tauri runtime. Event-dispatch coverage is left for E2E / native acceptance.
// NATIVE_NOT_RUN: live overlay, keyboard shortcuts, actual file bytes in a signed build.
