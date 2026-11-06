import assert from "node:assert/strict";
import test from "node:test";
import type { EffectiveSettings, EnvVar, Layer } from "./repoSettings.ts";
import {
  addError,
  currentRows,
  editError,
  effectiveEntries,
  envFileCounts,
  inheritedRows,
  loadedLabel,
  managedNameWarning,
  parsePasted,
  repoEnvFilePath,
  repoEnvSections,
  repoVarKey,
  userScopeEntries,
} from "./repoEnvModel.ts";

const v = (value: string, layer: Layer, envFile?: string): EnvVar => ({ value, source: { layer, origin: `/${layer}/settings.toml`, envFile } });
const env = (local: Record<string, EnvVar>, extra: Partial<EffectiveSettings["env"]> = {}): EffectiveSettings["env"] => ({ local, cloud: {}, files: [], ...extra });

test("an empty repository lists nothing and documents Conductor's 18 variables", () => {
  const sections = repoEnvSections(effectiveEntries(env({}), []), []);
  const rows = currentRows(sections.current);
  assert.equal(rows.setEntries.length, 0);
  assert.equal(rows.documentedEntries.length, 18);
  assert.equal(rows.documentedEntries[0].name, "HTTP_PROXY");
  assert.equal(sections.repoShared.length + sections.user.length, 0);
});

test("variables split into this repository's, Repo shared and User, as fOt/Ada do", () => {
  const e = env({ LOCAL: v("l", "repo_local"), SHARED: v("s", "repo_shared"), FILE_USER: v("u", "user", "/home/me/.env"), M: v("m", "managed") });
  const stored = [{ key: "STORED", value: "st" }];
  const s = repoEnvSections(effectiveEntries(e, stored), userScopeEntries(env({ FILE_USER: v("u", "user", "/home/me/.env") }), stored));
  assert.deepEqual(s.current.map((x) => x.key).sort(), ["LOCAL", "M"]);
  assert.deepEqual(s.repoShared.map((x) => x.key), ["SHARED"]);
  assert.deepEqual(s.user.map((x) => x.key).sort(), ["FILE_USER", "STORED"]);
  assert.equal(s.dimmedUserKeys.size, 0);
});

test("a user variable the repository overrides is listed under User, dimmed", () => {
  const e = env({ API_URL: v("repo", "repo_local") });
  const stored = [{ key: "API_URL", value: "mine" }];
  const s = repoEnvSections(effectiveEntries(e, stored), userScopeEntries(env({}), stored));
  assert.deepEqual(s.current.map((x) => [x.key, x.value]), [["API_URL", "repo"]]);
  assert.deepEqual(s.user.map((x) => [x.key, x.value]), [["API_URL", "mine"]]);
  assert.ok(s.dimmedUserKeys.has("API_URL"));
  const rows = inheritedRows(s.user, s.dimmedUserKeys);
  assert.equal(rows[0].dimmed, true);
  assert.equal(rows[0].canEdit, false);
});

test("a stored variable beats the user's env file, a repository value beats both, \"<none>\" hides it", () => {
  const e = env(
    { FROM_FILE: v("file", "user", "/h/.env"), PINNED: v("repo", "repo_shared") },
    { unset: { local: { GONE: "repo_local" }, cloud: {} } },
  );
  const stored = [
    { key: "FROM_FILE", value: "stored" },
    { key: "PINNED", value: "stored" },
    { key: "GONE", value: "stored" },
  ];
  const byKey = Object.fromEntries(effectiveEntries(e, stored).map((x) => [x.key, x.value]));
  assert.deepEqual(byKey, { FROM_FILE: "stored", PINNED: "repo" });
});

test("rows list documented variables first in Conductor's order, then the rest by name, env-file values last", () => {
  const e = env({
    ZED: v("z", "repo_local"),
    ALPHA: v("a", "repo_local"),
    ANTHROPIC_API_KEY: v("k", "repo_local"),
    HTTP_PROXY: v("p", "repo_local"),
    FROM_ENV: v("f", "repo_local", "/r/.env"),
    M: v("m", "managed"),
  });
  const { setEntries, documentedEntries } = currentRows(repoEnvSections(effectiveEntries(e, []), []).current);
  assert.deepEqual(setEntries.map((r) => r.name), ["HTTP_PROXY", "ANTHROPIC_API_KEY", "ALPHA", "M", "ZED", "FROM_ENV"]);
  assert.equal(setEntries[0].description, "Routes HTTP requests through a proxy.");
  assert.equal(setEntries.find((r) => r.name === "M")?.canDelete, false);
  assert.equal(setEntries.find((r) => r.name === "ALPHA")?.canEdit, true);
  assert.equal(documentedEntries.length, 16);
  assert.ok(!documentedEntries.some((d) => d.name === "HTTP_PROXY"));
});

test("inherited tables put env-file values after settings-file ones", () => {
  const s = repoEnvSections(effectiveEntries(env({ B: v("b", "repo_shared"), A: v("a", "repo_shared", "/r/.env"), C: v("c", "repo_shared") }), []), []);
  assert.deepEqual(inheritedRows(s.repoShared).map((r) => r.name), ["B", "C", "A"]);
});

test("validation copy follows Conductor's add and edit sheets", () => {
  assert.equal(editError(" ", "", []), "Variable name is required.");
  assert.match(editError("1X", "", []) ?? "", /^Variable names must start with a letter or underscore/);
  assert.equal(editError("A", "", ["A"]), "That variable already exists.");
  assert.equal(editError("A", "A", ["A"]), null);
  assert.equal(addError([{ key: "", value: "" }], new Set()), "Variable name is required.");
  assert.equal(addError([{ key: "A-B", value: "" }], new Set()), "Invalid variable name A-B. Names must start with a letter or underscore and contain only letters, numbers, and underscores.");
  assert.equal(addError([{ key: "A", value: "" }], new Set(["A"])), "That variable already exists in local.");
  assert.equal(addError([{ key: "A", value: "" }, { key: "B", value: "" }], new Set(["A", "B"])), "These variables already exist: A, B. Remove them from your pasted text and try again.");
  assert.equal(addError([{ key: "OK", value: "1" }], new Set()), null);
});

test("repository variables are written top level in environment_variables", () => {
  assert.equal(repoVarKey("API_URL"), "environment_variables.API_URL");
});

test("pasted blocks parse like Conductor's dotenv reader", () => {
  assert.deepEqual(parsePasted('# c\nexport A=1\nB="two words"\nC=\'x\'\n\nD="multi\nline"\nbad-name=3'), [
    { key: "A", value: "1" },
    { key: "B", value: "two words" },
    { key: "C", value: "x" },
    { key: "D", value: "multi\nline" },
    { key: "bad-name", value: "3" },
  ]);
  assert.deepEqual(parsePasted("just text"), []);
  assert.deepEqual(parsePasted('E="a \\"q\\""'), [{ key: "E", value: 'a "q"' }]);
});

test("env file paths are stored relative to .conductor, else with ~, as MZn does", () => {
  assert.equal(repoEnvFilePath(" .env ", "/r/app", "/home/me"), ".env");
  assert.equal(repoEnvFilePath("/r/app/.conductor/dev.env", "/r/app", "/home/me"), "dev.env");
  assert.equal(repoEnvFilePath("/r/app/.env", "/r/app", "/home/me"), "/r/app/.env");
  assert.equal(repoEnvFilePath("/home/me/.env", "/r/app", "/home/me"), "~/.env");
  assert.equal(repoEnvFilePath("/home/me", "/r/app", "/home/me"), "~");
  assert.equal(repoEnvFilePath("/etc/app.env", "/r/app", "/home/me"), "/etc/app.env");
});

test("env file counts come from the variables each entry still provides", () => {
  const e = env(
    { A: v("1", "repo_local", "/r/.conductor/.env"), B: v("2", "repo_local", "/r/.conductor/.env"), C: v("3", "repo_local") },
    { files: [{ layer: "repo_local", entry: ".env", path: "/r/.conductor/.env", loaded: 3 }] },
  );
  assert.equal(envFileCounts(e).get(".env"), 2);
  assert.equal(loadedLabel(1), "1 variable loaded");
  assert.equal(loadedLabel(2), "2 variables loaded");
});

test("names the app manages cannot be added (Het)", () => {
  assert.equal(managedNameWarning("PORT"), "PORT is managed by OpenConductor and can’t be set here.");
  assert.match(managedNameWarning("PATH") ?? "", /^PATH is managed by OpenConductor/);
  assert.ok(managedNameWarning("CONDUCTOR_INTERNAL_X"));
  assert.equal(managedNameWarning("API_URL"), null);
});

test("a user env-file value the repository overrides comes from userEnv and is dimmed", () => {
  const e = env({ API_URL: v("repo", "repo_local"), USER_TOKEN: v("abc", "user", "/h/user.env") });
  const user = env({ API_URL: v("mine", "user", "/h/user.env"), USER_TOKEN: v("abc", "user", "/h/user.env") });
  const s = repoEnvSections(effectiveEntries(e, []), userScopeEntries(user, []));
  assert.deepEqual(inheritedRows(s.user, s.dimmedUserKeys).map((r) => [r.name, r.value, r.dimmed]), [
    ["API_URL", "mine", true],
    ["USER_TOKEN", "abc", false],
  ]);
});
