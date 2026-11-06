import assert from "node:assert/strict";
import { test } from "node:test";
import { canSave, commandLine, editorHeight, nextScriptName, runEntry, sanitizeName, scriptId, scriptKey } from "./repoScripts.ts";
import type { RunScript } from "../scripts/model.ts";

const script = (over: Partial<RunScript> = {}): RunScript => ({
  id: "dev",
  label: "Dev",
  command: "npm",
  args: ["run", "dev"],
  cwd: null,
  default: false,
  icon: "play",
  hide: false,
  availableIn: ["local", "cloud"],
  layer: "repo_local",
  ...over,
});

test("names keep only what Conductor's name field keeps", () => {
  assert.equal(sanitizeName("  dev-server!!  now"), "dev server now");
  assert.equal(scriptId(" Dev  server "), "Dev-server");
  assert.equal(scriptId("!!!"), undefined);
  assert.equal(scriptKey("Dev Server"), "dev-server");
});

test("new scripts are named run, run 2, run 3 past every taken id", () => {
  assert.equal(nextScriptName([]), "run");
  assert.equal(nextScriptName(["dev"]), "run");
  assert.equal(nextScriptName(["Run"]), "run 2");
  assert.equal(nextScriptName(["run", "run-2", "run-7"]), "run 8");
  assert.equal(nextScriptName(["run-x"]), "run");
});

test("the editor is 48 px empty and grows 20 px a line", () => {
  assert.equal(editorHeight(""), 48);
  assert.equal(editorHeight("a\nb"), 68);
  assert.equal(editorHeight("", "x\ny\nz"), 88);
  assert.equal(editorHeight("", undefined, 4), 88);
});

test("an unchanged command line keeps command and args; an edited one replaces them", () => {
  const s = script({ default: true, cwd: "web" });
  assert.equal(commandLine(s), "npm run dev");
  assert.deepEqual(runEntry({ name: "dev", icon: "play", commandLine: "npm run dev" }, s), {
    command: "npm",
    args: ["run", "dev"],
    options: { cwd: "web" },
    default: true,
    icon: "play",
  });
  assert.deepEqual(runEntry({ name: "dev", icon: "zap", commandLine: " pnpm dev " }, s), { command: "pnpm dev", options: { cwd: "web" }, default: true, icon: "zap" });
  assert.deepEqual(runEntry({ name: "t", icon: "", commandLine: "make test" }), { command: "make test" });
  assert.equal(commandLine(script({ args: ["a b", "it's"] })), "npm 'a b' 'it'\\''s'");
});

test("Save needs a free name and a change", () => {
  const base = { name: "dev", icon: "play", commandLine: "npm run dev" };
  assert.equal(canSave(base, base, false, new Set()), false);
  assert.equal(canSave({ ...base, commandLine: "x" }, base, false, new Set()), true);
  assert.equal(canSave(base, base, true, new Set()), true);
  assert.equal(canSave({ ...base, name: "  " }, base, true, new Set()), false);
  assert.equal(canSave({ ...base, name: "Test" }, base, true, new Set(["test"])), false);
});
