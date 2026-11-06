import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configFromForm,
  emptyForm,
  formFromConfig,
  KINDS_FOR,
  missingFields,
  PROVIDER_AGENTS,
  secretInputs,
  secretKeys,
  SECRET_LABEL,
  visibleFields,
} from "./providers.ts";
import { DEFAULT_PROVIDER } from "./types.ts";

test("each agent offers its CLI login (the default) first, and no kind belongs to two agents", () => {
  for (const agent of PROVIDER_AGENTS) assert.equal(KINDS_FOR[agent][0], DEFAULT_PROVIDER[agent]);
  const all = Object.values(KINDS_FOR).flat();
  assert.equal(new Set(all).size, all.length);
});

test("configs round-trip through the form in the backend's serde shape", () => {
  const configs = [
    { kind: "claude_login" },
    { kind: "anthropic_api", auth: "auth_token", base_url: "https://gw.example.com" },
    { kind: "bedrock", region: "us-east-1", auth: { method: "profile", name: "work" } },
    { kind: "bedrock", region: "eu-west-1", auth: { method: "api_key" } },
    { kind: "vertex", project_id: "p", region: "us-east5", credentials_file: "/k.json" },
    { kind: "foundry", endpoint: { base_url: "https://x.services.ai.azure.com" }, api_key: true },
    { kind: "foundry", endpoint: { resource: "my-res" }, api_key: false },
    { kind: "openai_api", organization: "org-1", project: "proj" },
    { kind: "codex_gateway", gateway: "vercel_ai_gateway" },
  ] as const;
  for (const c of configs) assert.deepEqual(configFromForm(formFromConfig(c)), c);
});

test("blank optional fields are left out and model overrides carry over only for the same kind", () => {
  const prev = { kind: "anthropic_api" as const, models: { opus: "my-opus" } };
  const form = emptyForm("anthropic_api");
  form.values.base_url = "  ";
  assert.deepEqual(configFromForm(form, prev), { kind: "anthropic_api", auth: "api_key", models: { opus: "my-opus" } });
  assert.deepEqual(configFromForm(emptyForm("bedrock"), prev), { kind: "bedrock", auth: { method: "default_chain" } });
});

test("secret keys follow the chosen options, matching the Rust providers", () => {
  const form = emptyForm("anthropic_api");
  assert.deepEqual(secretKeys(form), ["anthropic_api_key"]);
  form.values.auth = "auth_token";
  assert.deepEqual(secretKeys(form), ["anthropic_auth_token"]);
  assert.deepEqual(secretKeys(emptyForm("bedrock")), []);
  assert.deepEqual(secretKeys(emptyForm("codex_gateway")), ["openrouter_api_key"]);
  assert.deepEqual(secretKeys(emptyForm("vertex")), []);
  assert.deepEqual(secretKeys(emptyForm("codex_login")), []);
  for (const kinds of Object.values(KINDS_FOR))
    for (const k of kinds) for (const key of secretKeys(emptyForm(k))) assert.ok(SECRET_LABEL[key], key);
});

test("blank keys are not sent, so a stored key is kept; pasted whitespace is trimmed", () => {
  const form = emptyForm("openai_api");
  assert.deepEqual(secretInputs(form, {}), []);
  assert.deepEqual(secretInputs(form, { openai_api_key: " sk-1\n", cursor_api_key: "x" }), [{ key: "openai_api_key", value: "sk-1" }]);
});

test("conditional fields and required checks", () => {
  const form = emptyForm("bedrock");
  assert.deepEqual(missingFields(form), ["AWS region"]);
  assert.ok(!visibleFields(form).some((f) => f.name === "profile_name"));
  form.values.region = "us-west-2";
  form.values.auth_method = "profile";
  assert.deepEqual(missingFields(form), ["AWS profile"]);
  form.values.profile_name = "dev";
  assert.deepEqual(missingFields(form), []);
});
