import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { DiffComment } from "./comments.ts";
import type { useReviewComments } from "./ReviewComments.tsx";
import type { FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const productPaths = new Set(["ReviewComments.tsx", "commentsApi.ts", "commentStore.ts", "comments.ts", "nav.ts"]
  .map((name) => resolve(root, "src/features/diff", name)));
const workspaceA = "11111111-1111-4111-8111-111111111111";
const workspaceB = "22222222-2222-4222-8222-222222222222";
const file: FileDiff = {
  path: "example.txt", old_path: null, status: "modified", binary: false, additions: 0, deletions: 0,
  hunks: [{ section: "", old_start: 1, old_lines: 8, new_start: 1, new_lines: 8,
    lines: Array.from({ length: 8 }, (_, i) => ({ kind: "context", text: `line ${i + 1}`, old_line: i + 1, new_line: i + 1 })) }],
};

type TextNode = string | { children: readonly TextNode[] } | readonly TextNode[];
function text(node: TextNode): string {
  if (typeof node === "string") return node;
  if ("children" in node) return node.children.map(text).join("");
  return node.map(text).join("");
}

function rows(workspace: string, prCount: number): DiffComment[] {
  const inline: DiffComment = {
    id: `${workspace}-inline`, workspace_id: workspace, file_path: file.path, line_number: 5, end_line_number: null,
    body: `${workspace}:inline`, state: "pending", location: "modified", file_level: false,
    created_at: 1, updated_at: null, remote_url: null, author: null, author_avatar_url: null,
    thread_id: null, reply_to_comment_id: null, is_outdated: false, is_resolved: false, suggestion_base_code: null,
  };
  return [inline, ...Array.from({ length: prCount }, (_, i) => ({ ...inline,
    id: `${workspace}-pr-${i}`, file_path: "", line_number: 0, location: "file", file_level: true, body: `${workspace}:pr-${i}`,
  } satisfies DiffComment))];
}

async function fixture() {
  const unexpected = () => assert.fail("Unexpected workspace-read boundary call");
  const pending: { workspaceId: string; resolve: (value: DiffComment[]) => void }[] = [];
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function invoke(command: string, args: Record<string, unknown>): Promise<DiffComment[]> {
    assert.equal(command, "diff_comments_list");
    assert.equal(typeof args.workspaceId, "string");
    const workspaceId = args.workspaceId;
    assert.ok(typeof workspaceId === "string");
    return new Promise<DiffComment[]>((resolve) => pending.push({ workspaceId, resolve }));
  }
  function load(filename: string): Record<string, unknown> {
    assert.ok(productPaths.has(filename), `Unexpected production dependency: ${filename}`);
    const existing = modules.get(filename);
    if (existing) return existing.exports;
    const module: { exports: Record<string, unknown> } = { exports: {} };
    modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_WORKSPACE_READ_REF && relative === "src/features/diff/ReviewComments.tsx"
      ? execFileSync("git", ["show", `${process.env.DIFF_WORKSPACE_READ_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const boundaries: Record<string, object> = {
      "../../backend": { inTauri: () => true, openUrl: unexpected },
      "../../components/DialogFrame": { DialogFrame: unexpected },
      "../../keybindings/KeybindingsProvider.tsx": { useKeybindings: () => undefined },
      "@tauri-apps/api/core": { invoke },
      "./commentMarkdown.ts": { CommentMarkdown: ({ text }: { text: string }) => React.createElement("comment-body", null, text) },
      "./FileDiffView": { revealLine: unexpected },
    };
    function require(name: string): unknown {
      if (["react", "react/jsx-runtime"].includes(name)) return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (Object.prototype.hasOwnProperty.call(boundaries, name)) return boundaries[name];
      return load(resolve(dirname(filename), name));
    }
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      console, Map, Set, Error, setInterval: unexpected, clearInterval: unexpected,
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const products = load(resolve(root, "src/features/diff/ReviewComments.tsx"));
  assert.ok(typeof products.useReviewComments === "function");
  const hook = products.useReviewComments;
  let review: ReturnType<typeof useReviewComments>;
  let mounts = 0;
  let unmounts = 0;
  function Probe({ workspace }: { workspace: string }) {
    assert.ok(typeof hook === "function");
    review = hook(workspace, { insert: unexpected, send: unexpected, attach: unexpected }, undefined, null);
    React.useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    React.useEffect(() => review.onLoaded([file], "all"), [review.onLoaded]);
    return React.createElement(React.Fragment, null,
      React.createElement("inline-comments", null, review.annotations(file, { side: "new", line: 5 })),
      React.createElement("review-actions", null, review.actions()));
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Probe, { workspace: workspaceA })); });
  return {
    pending,
    get mounts() { return mounts; },
    get unmounts() { return unmounts; },
    show: async (workspace: string) => { await act(async () => renderer.update(React.createElement(Probe, { workspace }))); },
    settle: async (index: number, value: DiffComment[]) => {
      const request = pending[index]; assert.ok(request, `Missing actual native list request ${index}`);
      await act(async () => request.resolve(value));
    },
    bodies: () => renderer.root.findByType("inline-comments").findAllByType("comment-body")
      .map((node: { props: { children: string } }) => node.props.children),
    prCount: () => renderer.root.findByType("review-actions").findAllByProps({ className: "tab-count" }).map(text),
    close: async () => { await act(async () => renderer.unmount()); },
  };
}

test("late native A read cannot replace B inline comments or PR count on the surviving hook", async (t) => {
  const f = await fixture(); t.after(f.close);
  assert.deepEqual(f.pending.map((request) => request.workspaceId), [workspaceA]);
  await f.show(workspaceB);
  assert.deepEqual(f.pending.map((request) => request.workspaceId), [workspaceA, workspaceB]);
  await f.settle(1, rows(workspaceB, 2));
  assert.deepEqual(f.bodies(), [`${workspaceB}:inline`]);
  assert.deepEqual(f.prCount(), ["2"]);
  await f.settle(0, rows(workspaceA, 1));
  assert.deepEqual(f.bodies(), [`${workspaceB}:inline`]);
  assert.deepEqual(f.prCount(), ["2"]);
  assert.equal(f.mounts, 1);
  assert.equal(f.unmounts, 0);
});

test("an unchanged-workspace rerender still accepts its pending native read without remounting", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.show(workspaceA);
  assert.deepEqual(f.pending.map((request) => request.workspaceId), [workspaceA]);
  await f.settle(0, rows(workspaceA, 1));
  assert.deepEqual(f.bodies(), [`${workspaceA}:inline`]);
  assert.deepEqual(f.prCount(), ["1"]);
  assert.equal(f.mounts, 1);
  assert.equal(f.unmounts, 0);
});
