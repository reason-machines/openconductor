import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchModelCatalog } from "./modelCatalog.ts";

test("catalogs contain only live IPC models and preserve local effort metadata", async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const result = await fetchModelCatalog(async (command, args) => {
    calls.push([command, args]);
    if (command === "reason_models") return { options: [{ value: "account-only-model", name: "My Reason model" }] };
    return [{ agent: args?.agent, id: `${args?.agent}-live`, name: "Live CLI model", efforts: ["low", "high"], defaultEffort: "high" }];
  });
  assert.deepEqual(result, {
    models: [
      { agent: "reason", id: "account-only-model", name: "My Reason model" },
      { agent: "claude", id: "claude-live", name: "Live CLI model", efforts: ["low", "high"], defaultEffort: "high" },
      { agent: "codex", id: "codex-live", name: "Live CLI model", efforts: ["low", "high"], defaultEffort: "high" },
    ], errors: {},
  });
  assert.deepEqual(calls, [["reason_models", undefined], ["local_model_catalog", { agent: "claude" }], ["local_model_catalog", { agent: "codex" }]]);
});

test("an unavailable agent does not erase another agent or fabricate fallback models", async () => {
  const result = await fetchModelCatalog(async (command, args) => {
    if (command === "reason_models") throw new Error("Reason is not paired");
    if (args?.agent === "claude") throw "Claude Code is not installed";
    return [{ agent: "codex", id: "local-only", name: "Local Codex" }];
  });
  assert.deepEqual(result.models, [{ agent: "codex", id: "local-only", name: "Local Codex" }]);
  assert.deepEqual(result.errors, { reason: "Reason is not paired", claude: "Claude Code is not installed" });
});

test("empty or malformed catalogs report unavailable for every agent", async () => {
  const result = await fetchModelCatalog(async (command, args) => {
    if (command === "reason_models") return { options: [{ name: "missing id" }] };
    if (args?.agent === "claude") return [];
    return [{ agent: "claude", id: "wrong-agent", name: "Invalid" }];
  });
  assert.deepEqual(result.models, []);
  assert.deepEqual(Object.keys(result.errors), ["reason", "claude", "codex"]);
});

test("refresh asks every source again rather than reusing a stale catalog", async () => {
  let generation = 0;
  const invoke = async (command: string, args?: Record<string, unknown>) => command === "reason_models"
    ? { options: [{ value: `live-${generation}`, name: "Reason" }] }
    : [{ agent: args?.agent, id: `live-${generation}`, name: "Local" }];
  const before = await fetchModelCatalog(invoke);
  generation++;
  const after = await fetchModelCatalog(invoke);
  assert.ok(before.models.every((model) => model.id === "live-0"));
  assert.ok(after.models.every((model) => model.id === "live-1"));
});

test("invalid local effort metadata cannot enter the catalog", async () => {
  const result = await fetchModelCatalog(async (command, args) => command === "reason_models" ? {}
    : [{ agent: args?.agent, id: "model", name: "Model", efforts: [42] }]);
  assert.deepEqual(result.models, []);
  assert.match(result.errors.claude ?? "", /effort metadata/);
  assert.match(result.errors.codex ?? "", /effort metadata/);
});
