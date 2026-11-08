import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { ComposerSession } from "./composerSession.ts";

function source(path: string) {
  return process.env.COMPOSER_REGRESSION_REF
    ? execFileSync("git", ["show", `${process.env.COMPOSER_REGRESSION_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}
function handler(source: string, signature: string, bindings: Record<string, unknown>) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1);
  const end = source.indexOf("\n  }", start) + "\n  }".length;
  const code = stripTypeScriptTypes(source.slice(start, end));
  return new Function(...Object.keys(bindings), `${code}; return ${signature.includes("onSubmit") ? "onSubmit" : "submit"};`)(...Object.values(bindings));
}

test("actual Composer and WorkspaceView submit handlers retain text and chips when native copy rejects", async () => {
  const session = new ComposerSession("chat-b", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect();
  const attachment = { name: ".context/attachments/abc123/binary.png", staged: ".context/attachments/abc123/binary.png", text: "The file is in the workspace" };
  session.setDraft("keep me"); session.setAttachments([attachment]);
  let deliveries = 0; const nativeCalls: unknown[] = [];
  const workspaceSubmit = handler(source("src/components/WorkspaceView.tsx"), "  async function onSubmit(text:", {
    session,
    attachments: session.snapshot().attachments,
    setAttachments: session.setAttachments,
    setAttachError: () => {},
    workspace: { id: "native-workspace" }, cwd: "/native/worktree",
    draftAttachmentsApi: { uploadToWorkspace: async (args: unknown) => { nativeCalls.push(args); throw Error("copy refused"); } },
    submit: () => { deliveries++; },
  });
  let submitted: Promise<unknown> | undefined;
  const composerSubmit = handler(source("src/features/chat/Composer.tsx"), "  function submit(opposite:", {
    inputRef: { current: { composing: () => false } }, draft: session.snapshot().draft,
    composerPrompt: (draft: string) => draft, hasAttachments: true,
    onCommand: undefined, working: false, mode: () => "queue", clearOnSubmit: false,
    setDraft: session.setDraft,
    onSubmit: (...args: unknown[]) => { submitted = workspaceSubmit(...args); },
  });
  composerSubmit(false); await submitted;
  assert.equal(deliveries, 0, "no invalid file note reaches the agent");
  assert.equal(session.snapshot().draft, "keep me");
  assert.deepEqual(session.snapshot().attachments, [attachment]);
  assert.deepEqual(nativeCalls, [{ localWorkspaceId: "native-workspace", relativePath: attachment.staged, workspacePath: "/native/worktree" }]);
  session.disconnect();
});
