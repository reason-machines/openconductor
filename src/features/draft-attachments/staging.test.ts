import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTACHMENTS_DIR, STAGING_DIR_NAME, draftAttachments, isStagedRelativePath } from "./staging.ts";

test("constants match Conductor's draft-attachments store", () => {
  assert.equal(STAGING_DIR_NAME, "draft-attachments");
  assert.equal(ATTACHMENTS_DIR, ".context/attachments");
});

test("only paths below .context/attachments/ can be staged", () => {
  assert.ok(isStagedRelativePath(".context/attachments/abc123/shot.png"));
  assert.ok(!isStagedRelativePath(".context/attachments"));
  assert.ok(!isStagedRelativePath(".context/attachmentsX/a"));
  assert.ok(!isStagedRelativePath("notes/a.txt"));
});

test("each call maps to its Rust command with camelCase args", async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const api = draftAttachments(async <T,>(command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return undefined as T;
  });
  const rel = ".context/attachments/k1/a.txt";
  await api.write({ draftWorkspaceId: "ws", relativePath: rel, data: new Uint8Array([1, 2]) });
  await api.resolve({ localWorkspaceId: "ws", relativePath: rel });
  await api.remove({ localWorkspaceId: "ws", relativePath: rel });
  await api.uploadToWorkspace({ localWorkspaceId: "ws", relativePath: rel, workspacePath: "/w" });
  await api.materialize({ localWorkspaceId: "ws", workspacePath: "/w" });
  await api.materializeLocalPath({ sourcePath: "/s", destinationPath: "/d" });
  assert.deepEqual(calls, [
    ["draft_attachment_write", { draftWorkspaceId: "ws", relativePath: rel, data: [1, 2] }],
    ["draft_attachment_resolve", { localWorkspaceId: "ws", relativePath: rel }],
    ["draft_attachment_remove", { localWorkspaceId: "ws", relativePath: rel }],
    ["draft_attachment_upload", { localWorkspaceId: "ws", relativePath: rel, workspacePath: "/w" }],
    ["draft_attachments_materialize", { localWorkspaceId: "ws", workspacePath: "/w" }],
    ["materialize_local_path_attachment", { sourcePath: "/s", destinationPath: "/d" }],
  ]);
});
