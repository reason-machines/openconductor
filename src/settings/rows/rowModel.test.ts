import { test } from "node:test";
import assert from "node:assert/strict";
import { envFileStatus, envNameError, envRows, parseEnvFiles, promptWrite, PROMPT_ROWS } from "./rowModel.ts";
import type { EffectiveSettings } from "../repoSettings.ts";

test("prompt rows show only prompts something here sends", () => {
  assert.deepEqual(PROMPT_ROWS.map((r) => r.kind), ["code_review", "create_pr", "general"]);
});

test("prompt saves write trimmed text, remove blanks and skip no-ops", () => {
  assert.deepEqual(promptWrite("general", undefined, "  Use pnpm. \n"), { key: "prompts.general", value: "Use pnpm." });
  assert.deepEqual(promptWrite("code_review", "Strict.", "   "), { key: "prompts.code_review", value: null });
  assert.equal(promptWrite("create_pr", "Same", " Same "), null);
  assert.equal(promptWrite("create_pr", undefined, ""), null);
});

test("env files parse one per line and report what loaded", () => {
  assert.deepEqual(parseEnvFiles(" ~/.env \r\n\n.env.local\n"), ["~/.env", ".env.local"]);
  assert.equal(envFileStatus(null), "File not found");
  assert.equal(envFileStatus(1), "1 variable loaded");
  assert.equal(envFileStatus(3), "3 variables loaded");
});

test("env names follow the dotenv rule", () => {
  assert.equal(envNameError("API_URL"), null);
  assert.equal(envNameError("_x1"), null);
  assert.ok(envNameError("1X"));
  assert.ok(envNameError("A-B"));
  assert.ok(envNameError(" "));
});

test("env rows list both contexts with their source", () => {
  const src = (layer: EffectiveSettings["git"]["archive_on_merge"]["layer"], envFile?: string) => ({ layer, origin: "x", ...(envFile ? { envFile } : {}) });
  const s = {
    env: {
      local: { B: { value: "2", source: src("repo_local") }, A: { value: "1", source: src("repo_shared", "/r/.env") } },
      cloud: { C: { value: "3", source: src("repo_local", "/r/.env") } },
      files: [],
    },
  } as unknown as EffectiveSettings;
  const rows = envRows(s);
  assert.deepEqual(rows.map((r) => `${r.context}:${r.name}:${r.removable}`), ["local:A:false", "local:B:true", "cloud:C:false"]);
  assert.equal(rows[0].envFile, "/r/.env");
});
