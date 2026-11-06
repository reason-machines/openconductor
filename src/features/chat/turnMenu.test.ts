import { test } from "node:test";
import assert from "node:assert/strict";
import { turnMenuItems, TURN_MENU_TOOLTIP, TURN_MENU_TRIGGER_LABEL } from "./turnMenu.ts";

const all = { canForkToTab: true, canForkToWorkspace: true, canReset: true, forkPending: false, resetBlocked: false };

test("trigger copy is Conductor's", () => {
  assert.equal(TURN_MENU_TRIGGER_LABEL, "Show message actions");
  assert.equal(TURN_MENU_TOOLTIP, "More actions");
});

test("items come in Conductor's order with its labels and icons", () => {
  assert.deepEqual(
    turnMenuItems(all).map((i) => [i.label, i.icon, i.disabled]),
    [
      ["Fork to new tab", "message-square-plus", false],
      ["Fork to new workspace", "split", false],
      ["Reset chat", "undo-2", false],
    ],
  );
});

test("each item shows only when its feature is offered; none hides the trigger", () => {
  assert.deepEqual(turnMenuItems({ ...all, canForkToWorkspace: false }).map((i) => i.id), ["fork-tab", "reset-chat"]);
  // The last turn has no Reset chat.
  assert.deepEqual(turnMenuItems({ ...all, canReset: false }).map((i) => i.id), ["fork-tab", "fork-workspace"]);
  assert.deepEqual(turnMenuItems({ ...all, canForkToTab: false, canForkToWorkspace: false, canReset: false }), []);
});

test("a fork in progress disables both forks, a busy agent only Reset chat", () => {
  assert.deepEqual(turnMenuItems({ ...all, forkPending: true }).map((i) => i.disabled), [true, true, false]);
  assert.deepEqual(turnMenuItems({ ...all, resetBlocked: true }).map((i) => i.disabled), [false, false, true]);
});
