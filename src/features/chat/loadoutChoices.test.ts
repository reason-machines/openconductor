import { test } from "node:test";
import assert from "node:assert/strict";
import { loadoutChoices, orderedModelChoices, selectLoadoutSlot } from "./loadoutChoices.ts";
import { builtIn } from "../../settings/agents/loadout.ts";
import { agentForPick, pickerState } from "./chatAgentChoice.ts";
import { createDispatcher, PRIORITY } from "../../keybindings/dispatcher.ts";
import { modelChoiceChip } from "./composerModels.ts";
import { bindCommands } from "../../keybindings/bind.ts";
import type { ModelChoice } from "./composerModels.ts";

const slots = loadoutChoices([
  builtIn("a", "future-claude", "adaptive", false, "claude"),
  null,
  builtIn("b", "future-codex", "xhigh", false, "codex"),
  null,
  builtIn("c", "reason/model", "high", false, "reason"),
]);

test("occupied loadout appears first in physical numeric order before current and catalog", () => {
  const favorites = slots.filter((pick): pick is ModelChoice => pick !== null);
  const current = { model: "current", effort: "low" };
  const catalog = { model: "catalog", effort: null };
  assert.deepEqual(orderedModelChoices(current, favorites, [catalog]).map((pick) => pick.model), ["future-claude", "future-codex", "reason/model", "current", "catalog"]);
  assert.equal(agentForPick(favorites[0]), "claude");
  assert.equal(agentForPick(favorites[1]), "codex");
  assert.equal(pickerState("claude", favorites[0], null, true, favorites).value, favorites[0]);
});

test("explicit dynamic efforts are shown exactly and missing efforts stay absent", () => {
  assert.equal(modelChoiceChip({ agent: "codex", model: "future-codex", effort: "adaptive" }).effort, "adaptive");
  assert.equal(modelChoiceChip({ agent: "claude", model: "opus", effort: null }).effort, null);
});

test("duplicate model IDs with different agent or effort remain distinct configurations", () => {
  const a: ModelChoice = { agent: "claude", model: "shared", effort: "high" };
  const b: ModelChoice = { agent: "codex", model: "shared", effort: "high" };
  const c: ModelChoice = { ...a, effort: "low" };
  assert.deepEqual(orderedModelChoices(a, [b, c, a]), [b, c, a]);
});

test("Cmd1–5 select exact physical slots including holes while typing, never workspace fallback", () => {
  const dispatcher = createDispatcher();
  const picked: ModelChoice[] = [];
  let workspaceSwitches = 0;
  const slotHandlers: Record<string, () => void> = {};
  const workspaceHandlers: Record<string, () => void> = {};
  for (let i = 0; i < 5; i++) {
    slotHandlers[`chat.selectLoadout${i + 1}`] = () => selectLoadoutSlot(slots, i, (pick) => picked.push(pick));
    workspaceHandlers[`workspace.switchTo${i + 1}`] = () => { workspaceSwitches++; };
  }
  bindCommands(dispatcher, workspaceHandlers);
  bindCommands(dispatcher, slotHandlers, {}, { priority: PRIORITY.HIGH, allowWhileTyping: true });
  for (let i = 1; i <= 5; i++) {
    assert.equal(dispatcher.dispatch({ key: String(i), code: `Digit${i}`, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false }, { activeDialogId: null, typing: true, inTerminal: false }).kind, "ran");
  }
  assert.deepEqual(picked, [slots[0], slots[2], slots[4]]);
  assert.equal(workspaceSwitches, 0);
  assert.deepEqual(picked.map(({ agent, model, effort }) => ({ agent, model, effort })), [
    { agent: "claude", model: "future-claude", effort: "adaptive" },
    { agent: "codex", model: "future-codex", effort: "xhigh" },
    { agent: "reason", model: "reason/model", effort: "high" },
  ]);
});
