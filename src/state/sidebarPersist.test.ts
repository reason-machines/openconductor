import { test } from "node:test";
import assert from "node:assert/strict";
import { sidebarWrite } from "./sidebarPersist.ts";

const ids = { repoId: "app", workspaceId: "app/oslo" };

test("row actions map to their conductor.db commands", () => {
  assert.deepEqual(sidebarWrite({ type: "setWorkspacePinned", ...ids, pinned: true }), { command: "db_set_workspace_pinned", args: { workspaceId: "app/oslo", pinned: true } });
  assert.deepEqual(sidebarWrite({ type: "setWorkspaceUnread", ...ids, unread: false }), { command: "db_set_workspace_unread", args: { workspaceId: "app/oslo", unread: false } });
  assert.deepEqual(sidebarWrite({ type: "setWorkspaceStatus", ...ids, status: "in-review" }), { command: "db_set_workspace_manual_status", args: { workspaceId: "app/oslo", status: "in-review" } });
  assert.equal(sidebarWrite({ type: "toggleSidebar" }), undefined);
  // Moving a workspace into a section unpins it; taking it out writes nothing here.
  assert.deepEqual(sidebarWrite({ type: "assignSection", workspaceId: "app/oslo", sectionId: "s1" }), { command: "db_set_workspace_pinned", args: { workspaceId: "app/oslo", pinned: false } });
  assert.equal(sidebarWrite({ type: "assignSection", workspaceId: "app/oslo", sectionId: null }), undefined);
});
