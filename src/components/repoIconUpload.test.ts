import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Repo } from "../state/types";
import * as repoIcon from "../state/repoIcon.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const png = "data:image/png;base64,dXBsb2Fk";

type Failure = "decode" | "context" | "encode";

function fixture(width: number, height: number, failure?: Failure) {
  const source = readFileSync(new URL("./RepoIconDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "RepoIconDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const events: string[] = [];
  const draws: { source: Image; quality: string; args: number[] }[] = [];
  const changes: (string | null)[] = [];
  const errors: string[] = [];
  const logged: unknown[][] = [];
  const revoked: string[] = [];
  const blobs: Blob[] = [];
  let closed = 0;
  let reads = 0;
  class Image {
    naturalWidth = width;
    naturalHeight = height;
    onload?: () => void;
    onerror?: () => void;
    set src(url: string) {
      assert.equal(url, "blob:repo-icon-upload");
      queueMicrotask(() => failure === "decode" ? this.onerror?.() : this.onload?.());
    }
  }
  const context = {
    imageSmoothingQuality: "low",
    drawImage(source: Image, ...args: number[]) {
      draws.push({ source, quality: this.imageSmoothingQuality, args });
      events.push("draw");
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext(kind: string) {
      assert.equal(kind, "2d");
      return failure === "context" ? null : context;
    },
    toDataURL(mime: string) {
      assert.equal(mime, "image/png");
      events.push("encode");
      if (failure === "encode") throw new Error("PNG encoding failed");
      return png;
    },
  };
  const exports: Partial<Pick<typeof import("./RepoIconDialog"), "RepoIconDialog">> = {};
  runInNewContext(javascript, {
    exports, Blob, Image,
    URL: {
      createObjectURL(blob: Blob) { blobs.push(blob); return "blob:repo-icon-upload"; },
      revokeObjectURL(url: string) { revoked.push(url); events.push("revoke"); },
    },
    document: {
      createElement(tag: string) { assert.equal(tag, "canvas"); return canvas; },
    },
    console: { error: (...args: unknown[]) => { logged.push(args); } },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../backend") return { openUrl: () => assert.fail("Unexpected URL launch in upload test") };
      if (name === "../state/repoIcon") return repoIcon;
      if (name === "./repoEmoji") return { searchEmoji() { throw new Error("Unexpected emoji tab"); } };
      if (name === "./Dialogs") return { Modal: ({ children }: { children: ReactNode }) => children };
      if (name === "./Icons") return { CloseIcon: () => null, SearchIcon: () => null };
      if (name === "./repoIcons.generated") return { REPO_ICONS: { folder: {} } };
      if (name === "./RepoIcon") return {
        isRepoIconName: (value: string) => value === "folder",
        RepoIconGlyph: () => null,
        useRepoFavicon() { throw new Error("Unexpected favicon I/O in upload test"); },
      };
      throw new Error(`Unexpected repository upload dependency: ${name}`);
    },
  });
  assert.ok(exports.RepoIconDialog);
  const repo: Repo = { id: "upload-repo", name: "Upload", path: "", defaultBranch: "main", workspaces: [], icon: null };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.RepoIconDialog, {
      repo,
      onChange: (value: string | null) => { changes.push(value); events.push("change"); },
      onClose: () => { closed++; events.push("close"); },
      onError: (message: string) => { errors.push(message); },
    }));
  });
  act(() => renderer.root.findByProps({ role: "tab", children: "Upload" }).props.onClick());
  return {
    events, draws, canvas, blobs, changes, errors, logged, revoked,
    closed: () => closed,
    reads: () => reads,
    busy: () => renderer.root.findByProps({ children: "Choose image…" }).props.disabled,
    async upload() {
      const file = {
        name: "icon.JPG", size: 3,
        async arrayBuffer() { reads++; return new Uint8Array([1, 2, 3]).buffer; },
      };
      await act(async () => {
        renderer.root.findByProps({ type: "file" }).props.onChange({ target: { files: [file] } });
      });
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const [width, height, args] of [[512, 256, [0, 32, 128, 64]], [64, 64, [0, 0, 64, 64]]] satisfies [number, number, number[]][]) {
  test(`Upload configures high-quality sampling before drawing ${width}x${height}, then picks the PNG and closes`, async () => {
    const view = fixture(width, height);
    try {
      await view.upload();
      assert.equal(view.draws.length, 1);
      assert.equal(view.draws[0].quality, "high", "canvas must receive high-quality sampling before drawImage");
      assert.equal(view.draws[0].source.naturalWidth, width);
      assert.equal(view.draws[0].source.naturalHeight, height);
      assert.deepEqual(view.draws[0].args, args);
      assert.equal(view.canvas.width, args[2]);
      assert.equal(view.canvas.height, args[2]);
      assert.equal(view.reads(), 1);
      assert.equal(view.blobs.length, 1);
      assert.equal(view.blobs[0].type, "image/jpeg");
      assert.deepEqual([...new Uint8Array(await view.blobs[0].arrayBuffer())], [1, 2, 3]);
      assert.deepEqual(view.changes, [png]);
      assert.equal(view.closed(), 1);
      assert.deepEqual(view.errors, []);
      assert.deepEqual(view.logged, []);
      assert.deepEqual(view.revoked, ["blob:repo-icon-upload"]);
      assert.deepEqual(view.events, ["draw", "encode", "revoke", "change", "close"]);
      assert.equal(view.busy(), false);
    } finally { view.close(); }
  });
}

for (const failure of ["decode", "context", "encode"] satisfies Failure[]) {
  test(`Upload releases its object URL and stays open after ${failure} failure`, async () => {
    const view = fixture(512, 256, failure);
    try {
      await view.upload();
      assert.deepEqual(view.revoked, ["blob:repo-icon-upload"]);
      assert.deepEqual(view.changes, []);
      assert.equal(view.closed(), 0);
      assert.deepEqual(view.errors, ["Could not set the icon. Try a different image."]);
      assert.equal(view.logged.length, 1);
      assert.equal(view.draws.length, failure === "encode" ? 1 : 0);
      assert.equal(view.busy(), false);
    } finally { view.close(); }
  });
}

test("Upload rejects excessive image dimensions without drawing and still releases its object URL", async () => {
  const view = fixture(10_001, 256);
  try {
    await view.upload();
    assert.deepEqual(view.revoked, ["blob:repo-icon-upload"]);
    assert.deepEqual(view.changes, []);
    assert.equal(view.closed(), 0);
    assert.deepEqual(view.errors, ["Could not set the icon. Try a different image."]);
    assert.equal(view.draws.length, 0);
    assert.equal(view.busy(), false);
  } finally { view.close(); }
});
