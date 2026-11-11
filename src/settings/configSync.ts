export const CONFIG_SYNC_CATEGORIES = [
  { id: "mcpServers", title: "MCP servers", description: "Agent tool server definitions." },
  { id: "slashCommands", title: "Slash commands", description: "Direct slash command prompt files." },
  { id: "skills", title: "Skills", description: "Reusable skill folders with SKILL.md files." },
] as const;

export type ConfigSyncCategory = (typeof CONFIG_SYNC_CATEGORIES)[number]["id"];
export const CONFIG_SYNC_DIRECTIONS = ["ccToCodex", "codexToCc"] as const;
export type ConfigSyncDirection = (typeof CONFIG_SYNC_DIRECTIONS)[number];
export interface ConfigSyncCategoryDiff {
  ccToCodex: string[];
  codexToCc: string[];
  error: string | null;
}
export type ConfigSyncDiff = Record<ConfigSyncCategory, ConfigSyncCategoryDiff>;
export interface ConfigSyncSelection {
  category: ConfigSyncCategory;
  direction: ConfigSyncDirection;
  name: string;
}
export interface ConfigSyncResult {
  successes: number;
  failures: { category: ConfigSyncCategory; name: string; reason: string }[];
  unsupportedMcp: string[];
}

export function configSyncItems(diff: ConfigSyncDiff): ConfigSyncSelection[] {
  return CONFIG_SYNC_CATEGORIES.flatMap(({ id: category }) => {
    const entries = diff[category];
    if (entries.error !== null) return [];
    return CONFIG_SYNC_DIRECTIONS.flatMap((direction) => entries[direction].map((name) => ({ category, direction, name })));
  });
}

export const configSyncKey = (item: ConfigSyncSelection): string => JSON.stringify([item.category, item.direction, item.name]);

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown): entry is string => typeof entry === "string")) {
    throw new Error("Invalid local config sync response.");
  }
  return value;
}

function categoryDiff(value: unknown): ConfigSyncCategoryDiff {
  if (typeof value !== "object" || value === null || !("ccToCodex" in value) || !("codexToCc" in value) || !("error" in value) || (value.error !== null && typeof value.error !== "string")) {
    throw new Error("Invalid local config sync response.");
  }
  return { ccToCodex: strings(value.ccToCodex), codexToCc: strings(value.codexToCc), error: value.error };
}

export function parseConfigSyncDiff(value: unknown): ConfigSyncDiff {
  if (typeof value !== "object" || value === null || !("mcpServers" in value) || !("slashCommands" in value) || !("skills" in value)) {
    throw new Error("Invalid local config sync response.");
  }
  return { mcpServers: categoryDiff(value.mcpServers), slashCommands: categoryDiff(value.slashCommands), skills: categoryDiff(value.skills) };
}

export function parseConfigSyncResult(value: unknown): ConfigSyncResult {
  if (typeof value !== "object" || value === null || !("successes" in value) || typeof value.successes !== "number" || !Number.isSafeInteger(value.successes) || value.successes < 0 || !("failures" in value) || !Array.isArray(value.failures) || !("unsupportedMcp" in value)) {
    throw new Error("Invalid local config sync response.");
  }
  const failures = value.failures.map((failure: unknown) => {
    if (typeof failure !== "object" || failure === null || !("category" in failure) || !("name" in failure) || typeof failure.name !== "string" || !("reason" in failure) || typeof failure.reason !== "string") {
      throw new Error("Invalid local config sync response.");
    }
    const category = CONFIG_SYNC_CATEGORIES.find(({ id }) => id === failure.category)?.id;
    if (category === undefined) throw new Error("Invalid local config sync response.");
    return { category, name: failure.name, reason: failure.reason };
  });
  return { successes: value.successes, failures, unsupportedMcp: strings(value.unsupportedMcp) };
}
