import { parseModelOptions } from "../features/chat/reasonModels.ts";

export type CatalogModel = {
  agent: "reason" | "claude" | "codex";
  id: string;
  name: string;
  efforts?: readonly string[];
  defaultEffort?: string | null;
};

export type ModelCatalog = {
  models: CatalogModel[];
  errors: Partial<Record<CatalogModel["agent"], string>>;
};

type CatalogInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

async function desktopInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

function reasonCatalog(value: unknown): CatalogModel[] {
  if (!value || typeof value !== "object" || !("options" in value)) {
    throw new Error("Reason ACP returned no model catalog");
  }
  return parseModelOptions(value.options)
    .filter((model) => model.value.trim() && model.name.trim())
    .map((model) => ({ agent: "reason", id: model.value, name: model.name }));
}

function localCatalog(value: unknown, agent: "claude" | "codex"): CatalogModel[] {
  if (!Array.isArray(value)) throw new Error("The local CLI returned an invalid model catalog");
  return value.map((model: unknown): CatalogModel => {
    if (!model || typeof model !== "object" || !("agent" in model) || model.agent !== agent
      || !("id" in model) || typeof model.id !== "string" || !model.id.trim()
      || !("name" in model) || typeof model.name !== "string" || !model.name.trim()) {
      throw new Error("The local CLI returned an invalid model catalog entry");
    }
    const parsed: CatalogModel = { agent, id: model.id, name: model.name };
    if ("efforts" in model && model.efforts !== undefined) {
      if (!Array.isArray(model.efforts) || !model.efforts.every((effort: unknown) => typeof effort === "string" && effort.length > 0)) {
        throw new Error("The local CLI returned invalid effort metadata");
      }
      parsed.efforts = model.efforts;
    }
    if ("defaultEffort" in model && model.defaultEffort !== undefined) {
      if (model.defaultEffort !== null && typeof model.defaultEffort !== "string") {
        throw new Error("The local CLI returned an invalid default effort");
      }
      parsed.defaultEffort = model.defaultEffort;
    }
    return parsed;
  });
}

/** Fetches live catalogs independently; failures never substitute cached or invented models. */
export async function fetchModelCatalog(invoke: CatalogInvoke = desktopInvoke): Promise<ModelCatalog> {
  const agents = ["reason", "claude", "codex"] as const;
  const results = await Promise.allSettled(agents.map(async (agent) => {
    const models = agent === "reason"
      ? reasonCatalog(await invoke("reason_models"))
      : localCatalog(await invoke("local_model_catalog", { agent }), agent);
    if (models.length === 0) throw new Error("No models were advertised by this agent");
    return models;
  }));
  const catalog: ModelCatalog = { models: [], errors: {} };
  results.forEach((result, index) => {
    const agent = agents[index];
    if (result.status === "fulfilled") catalog.models.push(...result.value);
    else catalog.errors[agent] = result.reason instanceof Error ? result.reason.message : String(result.reason);
  });
  return catalog;
}
