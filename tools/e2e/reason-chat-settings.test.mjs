import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../../src/settings/types.ts";
import { builtIn, loadoutSlots, parseFavorites, slotsToRows, withDefault } from "../../src/settings/agents/loadout.ts";
import { defaultChatConfig } from "../../src/features/chat/chatModel.ts";

const source = readFileSync(new URL("./reason-chat.e2e.mjs", import.meta.url), "utf8");
const script = source.match(/const seeded = await runAsync\(\s*`([\s\S]+?)`,\s*project,\s*\);/)?.[1];
assert.ok(script, "the driver's actual workspace seeding script is present");
const expectedModel = "byok:anthropic:claude-opus-5-5";

for (const physicalSlot of [false, true]) {
  test(`Reason chat fixture replaces the first-run Reason pin${physicalSlot ? " and physical default slot" : ""}`, async () => {
    const initial = builtIn("default", "openai/gpt-6.1-sol", undefined, false, "reason");
    let settings = withDefault({ ...DEFAULT_SETTINGS, reason_executable_path: "/fixture/bin/reason" }, initial);
    let favorites = physicalSlot ? slotsToRows([initial]) : [];
    let created;
    const calls = [];
    const invoke = async (command, args) => {
      calls.push(command);
      switch (command) {
        case "get_settings": return structuredClone(settings);
        case "update_settings": settings = structuredClone(args.settings); return settings;
        case "favorite_models_replace": favorites = structuredClone(args.favorites); return;
        case "add_repository": return { id: "repo" };
        case "create_workspace":
          created = { settings, favorites };
          return { workspace: { id: "workspace", branchName: args.branchName } };
        default: throw new Error(`unexpected fixture IPC: ${command}`);
      }
    };
    const execute = new Function("window", `return function () {${script}};`)({ __TAURI_INTERNALS__: { invoke } });
    const result = await new Promise((done) => execute("/fixture/project", done));
    assert.ok(result.workspace, JSON.stringify(result));
    assert.equal(defaultChatConfig(created.settings).find((option) => option.id === "model")?.value, expectedModel);
    const slot = loadoutSlots(created.settings, parseFavorites(created.favorites))[0];
    assert.equal(slot?.agent, "reason");
    assert.equal(slot?.model, expectedModel);
    assert.equal(created.settings.models.default, expectedModel);
    assert.equal(created.settings.models.default_agent, "reason");
    assert.equal(created.settings.models.default_initialized, true);
    assert.deepEqual(created.favorites, slotsToRows([builtIn("default", expectedModel, undefined, false, "reason")]));
    assert.equal(created.settings.reason.workspace, "ws-a");
    assert.equal(created.settings.reason_executable_path, "/fixture/bin/reason");
    assert.deepEqual(calls, ["get_settings", "favorite_models_replace", "update_settings", "add_repository", "create_workspace"]);
  });
}
