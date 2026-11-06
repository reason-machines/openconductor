import { test } from "node:test";
import assert from "node:assert/strict";
import { sidebarWrite } from "./sidebarPersist.ts";

const ids = { repoId: "app", workspaceId: "app/oslo" };

test("row actions map to their conductor.db commands", () => {
  assert.deepEqual(sidebarWrite({ type: "setWorkspacePinned", ...ids, pinned: true }), { command: "db_set_workspace_pinned", args: { workspaceId: "app/oslo", pinned: true } });
  assert.deepEqual(sidebarWrite({ type: "setChatUnread", ...ids, chatId: "app/oslo:review:1", unread: true, at: 5 }), {
    command: "db_set_chat_unread",
    args: { chatId: "app/oslo:review:1", workspaceId: "app/oslo", unread: true },
  });
  assert.deepEqual(sidebarWrite({ type: "markWorkspaceRead", ...ids }), { command: "db_mark_workspace_read", args: { workspaceId: "app/oslo" } });
  assert.deepEqual(sidebarWrite({ type: "setWorkspaceStatus", ...ids, status: "in-review" }), { command: "db_set_workspace_manual_status", args: { workspaceId: "app/oslo", status: "in-review" } });
  // Every send (Codex's too) moves last activity in conductor.db.
  assert.deepEqual(sidebarWrite({ type: "touchWorkspace", ...ids, at: 1_700_000_000_000 }), { command: "db_touch_workspace", args: { workspaceId: "app/oslo", at: 1_700_000_000_000 } });
  assert.equal(sidebarWrite({ type: "toggleSidebar" }), undefined);
  // Moving a workspace into a section unpins it; taking it out writes nothing here.
  assert.deepEqual(sidebarWrite({ type: "assignSection", workspaceId: "app/oslo", sectionId: "s1" }), { command: "db_set_workspace_pinned", args: { workspaceId: "app/oslo", pinned: false } });
  assert.equal(sidebarWrite({ type: "assignSection", workspaceId: "app/oslo", sectionId: null }), undefined);
});
