import test from "node:test";
import assert from "node:assert/strict";
import { mutateWorkspaceLinks } from "./workspaceLinks.ts";

test("workspace toggles preserve identity and raw paths use a different mutation", async () => {
  const calls: unknown[] = [];
  const mutate = async (args: unknown) => { calls.push(args); };
  await mutateWorkspaceLinks({ workspaceId: "source", selection: { kind: "workspace", id: "target" }, linkedWorkspaceIds: [], mutate });
  await mutateWorkspaceLinks({ workspaceId: "source", selection: { kind: "workspace", id: "target" }, linkedWorkspaceIds: ["target"], mutate });
  await mutateWorkspaceLinks({ workspaceId: "source", selection: { kind: "directory", path: "/extra" }, linkedWorkspaceIds: [], mutate });
  assert.deepEqual(calls, [
    { workspaceId: "source", kind: "workspace", value: "target", linked: true },
    { workspaceId: "source", kind: "workspace", value: "target", linked: false },
    { workspaceId: "source", kind: "directory", value: "/extra", linked: true },
  ]);
});

test("failed writes reject without publishing a successful selection", async () => {
  await assert.rejects(mutateWorkspaceLinks({ workspaceId: "source", selection: { kind: "directory", path: "/extra" }, linkedWorkspaceIds: [], mutate: async () => { throw new Error("write failed"); } }), /write failed/);
});
