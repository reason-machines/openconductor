import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as comments from "./comments.ts";
import * as navigation from "./nav.ts";
import type { DiffComment } from "./comments.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourcePath = resolve("src/features/diff/ReviewComments.tsx");
const javascript = ts.transpileModule(`${readFileSync(sourcePath, "utf8")}\nexport { CommentItem };`, {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture(comment: DiffComment) {
  let confirmations = 0;
  const removed: DiffComment[] = [];
  const unexpected = () => { throw new Error("Unexpected comment-card boundary call"); };
  const boundaries: Record<string, object> = {
    "../../backend": { openUrl: unexpected },
    "../../keybindings/KeybindingsProvider.tsx": { useKeybindings: unexpected },
    "./commentsApi.ts": { commentStoreFor: unexpected },
    "./comments.ts": comments,
    "./commentMarkdown.ts": { CommentMarkdown: ({ text }: { text: string }) => React.createElement("p", null, text) },
    "../chat/chat.css": {},
    "./comments-github.css": {},
    "./FileDiffView": { revealLine: unexpected },
    "./nav.ts": navigation,
  };
  const module = { exports: {} };
  const evaluate = runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, {
    window: { confirm: () => { confirmations++; return false; } },
  });
  evaluate((name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected dependency: ${name}`);
    return boundaries[name];
  }, module, module.exports);
  assert.ok("CommentItem" in module.exports && typeof module.exports.CommentItem === "function");
  const CommentItem = module.exports.CommentItem;
  const ops = {
    remove: (c: DiffComment) => { removed.push(c); return Promise.resolve(true); },
    edit: unexpected, reply: unexpected, resolve: unexpected, toChat: unexpected,
  };
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(CommentItem, { c: comment, ops })); });
  const deleteButtons = () => renderer.root.findAllByType("button").filter((node: { props: { children?: unknown; "aria-label"?: string } }) =>
    node.props.children === "Delete" || node.props["aria-label"] === "Delete comment",
  );
  return {
    removed,
    confirmations: () => confirmations,
    deleteButtons,
    clickDelete() {
      const buttons = deleteButtons();
      assert.equal(buttons.length, 1);
      act(() => buttons[0].props.onClick());
    },
    close() { act(() => renderer.unmount()); },
  };
}

const root = comments.newLocalComment({ id: "root", workspaceId: "fixture", filePath: "fixture.ts", side: "new", start: 2, body: "Review this line", now: 1 });
const reply = comments.newLocalComment({ id: "reply", workspaceId: "fixture", filePath: "fixture.ts", side: "new", start: 2, body: "Reply", now: 2, replyTo: root });

for (const comment of [root, reply]) {
  test(`the actual local ${comment.id === root.id ? "root" : "reply"} Delete acts without confirmation`, () => {
    const view = fixture(comment);
    try {
      view.clickDelete();
      assert.equal(view.confirmations(), 0, "Delete must not request confirmation");
      assert.equal(view.removed.length, 1);
      assert.equal(view.removed[0], comment, "the selected comment reaches the existing remove operation unchanged");
    } finally { view.close(); }
  });
}

for (const origin of ["remote", "agent-local"]) {
  for (const state of ["pending", "sent"] satisfies DiffComment["state"][]) {
    test(`the actual ${origin} ${state} card preserves Delete eligibility and dispatch`, () => {
      const comment: DiffComment = { ...root, id: `${origin}-${state}`, state, author: "reviewer", remote_url: origin === "remote" ? "https://example.invalid/review" : null };
      const view = fixture(comment);
      try {
        assert.equal(view.deleteButtons().length, state === "sent" ? 1 : 0);
        if (state === "sent") {
          view.clickDelete();
          assert.equal(view.removed.length, 1);
          assert.equal(view.removed[0], comment);
        } else {
          assert.equal(view.removed.length, 0);
        }
        assert.equal(view.confirmations(), 0);
      } finally { view.close(); }
    });
  }
}
