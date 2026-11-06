// Form model for Settings › Agents (Conductor's `providers` route). Maps a
// stored `agent::ProviderConfig` to flat form values and back, and mirrors
// each provider's `secret_keys()` so the page asks for exactly the keys the
// backend will accept. Kinds and options follow src-tauri/src/agent/
// (claude.rs, claude_cloud.rs, codex.rs); help text echoes Conductor's copy
// (evidence/providers/README.md).
import type { AgentKind, ProviderConfig, ProviderKind, SecretInput } from "./types";

/** The agents Conductor's Agents page configures, in its order. */
export type ProviderAgent = Exclude<AgentKind, "reason">;
export const PROVIDER_AGENTS: ProviderAgent[] = ["claude", "codex", "cursor", "opencode"];
export const PROVIDER_AGENT_LABEL: Record<ProviderAgent, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
};

export const KIND_LABEL: Record<ProviderKind, string> = {
  claude_login: "Claude Code login",
  anthropic_api: "Anthropic API",
  bedrock: "Amazon Bedrock",
  vertex: "Google Vertex AI",
  foundry: "Microsoft Foundry",
  codex_login: "ChatGPT (Codex login)",
  openai_api: "OpenAI API key",
  codex_gateway: "OpenRouter or Vercel AI Gateway",
  cursor_api: "Cursor API key",
  opencode_login: "OpenCode login",
  reason_login: "Reason login",
  reason_api: "Reason API key",
};

export const KINDS_FOR: Record<ProviderAgent, ProviderKind[]> = {
  claude: ["claude_login", "anthropic_api", "bedrock", "vertex", "foundry"],
  codex: ["codex_login", "openai_api", "codex_gateway"],
  cursor: ["cursor_api"],
  opencode: ["opencode_login"],
};

export const SECRET_LABEL: Record<string, string> = {
  anthropic_api_key: "Anthropic API key",
  anthropic_auth_token: "Anthropic auth token",
  bedrock_api_key: "Bedrock API key",
  foundry_api_key: "Foundry API key",
  openai_api_key: "OpenAI API key",
  openrouter_api_key: "OpenRouter API key",
  vercel_ai_gateway_api_key: "Vercel AI Gateway key",
  cursor_api_key: "Cursor API key",
};

export type FormValues = Record<string, string>;
export interface ProviderForm {
  kind: ProviderKind;
  values: FormValues;
}

export interface Field {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Shown only when this returns true for the current values. */
  when?: (v: FormValues) => boolean;
}

export const FIELDS: Partial<Record<ProviderKind, Field[]>> = {
  anthropic_api: [
    { name: "auth", label: "Authentication", options: [{ value: "api_key", label: "API key" }, { value: "auth_token", label: "Auth token" }] },
    { name: "base_url", label: "Base URL", help: "Overrides the Anthropic API base URL." },
  ],
  bedrock: [
    { name: "region", label: "AWS region", help: "Selects the AWS region for Bedrock requests.", required: true },
    {
      name: "auth_method",
      label: "Credentials",
      options: [
        { value: "default_chain", label: "AWS default credentials" },
        { value: "profile", label: "Named AWS profile" },
        { value: "api_key", label: "Bedrock API key" },
      ],
    },
    { name: "profile_name", label: "AWS profile", help: "Uses a named AWS profile for Bedrock credentials.", required: true, when: (v) => v.auth_method === "profile" },
  ],
  vertex: [
    { name: "project_id", label: "GCP project", help: "Selects the GCP project for Vertex AI requests.", required: true },
    { name: "region", label: "Region", required: true },
    { name: "credentials_file", label: "Service account file", help: "Points Claude Code at a Google service account file for Vertex AI." },
  ],
  foundry: [
    { name: "endpoint_type", label: "Endpoint", options: [{ value: "resource", label: "Resource name" }, { value: "base_url", label: "Base URL" }] },
    { name: "endpoint", label: "Resource or URL", required: true },
    { name: "api_key", label: "Credentials", options: [{ value: "false", label: "Azure credentials" }, { value: "true", label: "Foundry API key" }] },
  ],
  openai_api: [
    { name: "base_url", label: "Base URL", help: "Overrides the base URL used for Codex API requests." },
    { name: "organization", label: "OpenAI organization" },
    { name: "project", label: "OpenAI project" },
  ],
  codex_gateway: [
    { name: "gateway", label: "Gateway", options: [{ value: "open_router", label: "OpenRouter" }, { value: "vercel_ai_gateway", label: "Vercel AI Gateway" }] },
  ],
};

const DEFAULT_VALUES: Partial<Record<ProviderKind, FormValues>> = {
  anthropic_api: { auth: "api_key" },
  bedrock: { auth_method: "default_chain" },
  foundry: { endpoint_type: "resource", api_key: "false" },
  codex_gateway: { gateway: "open_router" },
};

export const visibleFields = (form: ProviderForm): Field[] => (FIELDS[form.kind] ?? []).filter((f) => !f.when || f.when(form.values));

/** A fresh form for `kind`, with each select on its default. */
export const emptyForm = (kind: ProviderKind): ProviderForm => ({ kind, values: { ...(DEFAULT_VALUES[kind] ?? {}) } });

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The form for a stored config. */
export function formFromConfig(config: ProviderConfig): ProviderForm {
  const form = emptyForm(config.kind);
  const v = form.values;
  const c = config as Record<string, unknown>;
  for (const f of FIELDS[config.kind] ?? []) if (typeof c[f.name] === "string") v[f.name] = c[f.name] as string;
  if (config.kind === "bedrock" && c.auth && typeof c.auth === "object") {
    const auth = c.auth as { method?: string; name?: string };
    v.auth_method = auth.method ?? "default_chain";
    if (auth.name) v.profile_name = auth.name;
  }
  if (config.kind === "foundry") {
    const endpoint = (c.endpoint ?? {}) as Record<string, unknown>;
    v.endpoint_type = "base_url" in endpoint ? "base_url" : "resource";
    v.endpoint = str(endpoint[v.endpoint_type]);
    v.api_key = c.api_key === true ? "true" : "false";
  }
  return form;
}

/**
 * The config to send to `connect_provider`. Blank optional fields are left
 * out; model overrides (not edited here) carry over from `previous` when the
 * kind is unchanged.
 */
export function configFromForm(form: ProviderForm, previous?: ProviderConfig | null): ProviderConfig {
  const v = Object.fromEntries(Object.entries(form.values).map(([k, x]) => [k, x.trim()]));
  const config: ProviderConfig = { kind: form.kind };
  for (const f of visibleFields(form)) {
    if (["auth_method", "profile_name", "endpoint_type", "endpoint", "api_key"].includes(f.name)) continue;
    if (v[f.name]) config[f.name] = v[f.name];
  }
  if (form.kind === "bedrock") {
    config.auth = v.auth_method === "profile" ? { method: "profile", name: v.profile_name ?? "" } : { method: v.auth_method || "default_chain" };
  }
  if (form.kind === "foundry") {
    config.endpoint = { [v.endpoint_type || "resource"]: v.endpoint ?? "" };
    config.api_key = v.api_key === "true";
  }
  if (previous?.kind === form.kind && previous.models) config.models = previous.models;
  return config;
}

/** Store keys the form's provider reads; mirrors each Rust `secret_keys()`. */
export function secretKeys(form: ProviderForm): string[] {
  const v = form.values;
  switch (form.kind) {
    case "anthropic_api":
      return [v.auth === "auth_token" ? "anthropic_auth_token" : "anthropic_api_key"];
    case "bedrock":
      return v.auth_method === "api_key" ? ["bedrock_api_key"] : [];
    case "foundry":
      return v.api_key === "true" ? ["foundry_api_key"] : [];
    case "openai_api":
      return ["openai_api_key"];
    case "codex_gateway":
      return [v.gateway === "vercel_ai_gateway" ? "vercel_ai_gateway_api_key" : "openrouter_api_key"];
    case "cursor_api":
      return ["cursor_api_key"];
    default:
      return [];
  }
}

/** Required fields left blank, by label; empty when the form can be sent. */
export function missingFields(form: ProviderForm): string[] {
  return visibleFields(form)
    .filter((f) => f.required && !(form.values[f.name] ?? "").trim())
    .map((f) => f.label);
}

/** Typed keys to send. A blank key is left out, so a stored key is kept. */
export const secretInputs = (form: ProviderForm, typed: FormValues): SecretInput[] =>
  secretKeys(form)
    .map((key) => ({ key, value: (typed[key] ?? "").trim() }))
    .filter((s) => s.value !== "");
