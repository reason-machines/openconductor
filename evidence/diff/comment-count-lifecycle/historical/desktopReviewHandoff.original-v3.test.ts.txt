import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { newLocalComment } from "../diff/comments.ts";

const dependencies = createRequire(import.meta.url);
const ts = dependencies("typescript");
const root = resolve(".");
const products = new Set([
  "src/features/chat/desktopHost.ts", "src/features/diff/commentsApi.ts",
  "src/features/diff/comments.ts", "src/features/diff/commentStore.ts",
  "src/features/diff/reviewCommentEvents.ts",
].map((path) => resolve(root, path)));

function fixture(tauri: boolean) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const invoked: { command: string; args: unknown }[] = [];
  const loaded = new Map<string, Record<string, unknown>>();
  const invoke = async (command: string, args: unknown) => { invoked.push({ command, args }); return undefined; };
  function load(filename: string): Record<string, unknown> {
    assert.ok(products.has(filename), `Unexpected production handoff dependency ${filename}`);
    const cached = loaded.get(filename);
    if (cached) return cached;
    const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module: { exports: Record<string, unknown> } = { exports: {} };
    const require = (name: string) => {
      if (name === "@tauri-apps/api/core") return { invoke, isTauri: () => tauri };
      if (name === "../diff/useTurnChanges.ts") return { turnChanges: { record() {} } };
      if (name === "../../backend") return { inTauri: () => tauri };
      const base = resolve(dirname(filename), name);
      const target = [base, `${base}.ts`].find((path) => products.has(path));
      assert.ok(target, `Unexpected import ${name}`);
      return load(target);
    };
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      console, Map, Set, Date, Error, Promise, localStorage: storage,
    }, { filename })(require, module, module.exports);
    loaded.set(filename, module.exports);
    return module.exports;
  }
  const host = load(resolve(root, "src/features/chat/desktopHost.ts")).desktopHost;
  assert.ok(host && typeof host === "object");
  assert.ok("onPromptHandoff" in host && typeof host.onPromptHandoff === "function", "Actual desktop host must consume successful prompt handoff");
  return {
    storage, invoked,
    handoff: (workspace: string, attachments: readonly { name: string; text: string; commentId?: string }[]) => host.onPromptHandoff(workspace, attachments),
    rows: (workspace: string): { id: string; state: string }[] => JSON.parse(storage.getItem(`openconductor.diff.comments.${workspace}`) ?? "[]"),
  };
}

const review = (id: string) => ({ name: `${id}.md`, text: `Review ${id}`, commentId: id });
const comment = (id: string, workspaceId = "one") => newLocalComment({ id, workspaceId, filePath: "example.ts", side: "new", start: 1, body: id, now: 1 });

test("actual browser host commits only captured review identities and preserves superseded rows", async () => {
  const f = fixture(false);
  f.storage.setItem("openconductor.diff.comments.one", JSON.stringify([comment("one"), { ...comment("old"), state: "superseded" }, comment("other")]));
  f.storage.setItem("openconductor.diff.comments.two", JSON.stringify([comment("one", "two")]));
  await f.handoff("one", [review("one"), review("old"), { name: "ordinary.txt", text: "not a review" }]);
  assert.deepEqual(f.rows("one").map(({ id, state }) => ({ id, state })), [
    { id: "one", state: "reviewed" }, { id: "old", state: "superseded" }, { id: "other", state: "pending" },
  ]);
  assert.equal(f.rows("two")[0].state, "pending");
  assert.deepEqual(f.invoked, []);
});

test("actual desktop host sends the review transition to the native store, not to ordinary attachments", async () => {
  const f = fixture(true);
  await f.handoff("one", [review("one"), review("two"), { name: "ordinary.txt", text: "not a review" }]);
  assert.equal(f.invoked.length, 1);
  assert.equal(f.invoked[0].command, "diff_comments_mark_reviewed");
  assert.deepEqual(JSON.parse(JSON.stringify(f.invoked[0].args)), { workspaceId: "one", ids: ["one", "two"] });
});

test("ordinary attachments have no review-store side effect at handoff", async () => {
  const f = fixture(true);
  await f.handoff("one", [{ name: "ordinary.txt", text: "plain file" }]);
  assert.deepEqual(f.invoked, []);
});
