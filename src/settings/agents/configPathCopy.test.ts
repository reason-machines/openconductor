import { test } from "node:test";
import assert from "node:assert/strict";
import { copySettingsPath } from "./kitModel.ts";

test("Copy path writes the complete original config file path and confirms only after the clipboard succeeds", async () => {
  const events: string[] = [];
  let release!: () => void;
  const written = new Promise<void>((resolve) => { release = resolve; });
  const copying = copySettingsPath(
    "/Users/Sven Myhre/.claude/設定.json",
    (value) => { events.push(value); return written; },
    (kind, message) => events.push(`${kind}: ${message}`),
  );
  assert.deepEqual(events, ["/Users/Sven Myhre/.claude/設定.json"]);
  release();
  await copying;
  assert.deepEqual(events, ["/Users/Sven Myhre/.claude/設定.json", "info: Copied file path to clipboard"]);
});

test("directory cards use directory copy feedback without changing the payload", async () => {
  const events: string[] = [];
  await copySettingsPath("/Users/sven/.config/reason", async (value) => { events.push(value); }, (kind, message) => events.push(`${kind}: ${message}`), "directory path");
  assert.deepEqual(events, ["/Users/sven/.config/reason", "info: Copied directory path to clipboard"]);
});

test("a rejected clipboard write reports failure without claiming a copy succeeded", async () => {
  const events: string[] = [];
  await copySettingsPath("/Users/sven/.codex/config.toml", async () => { throw new Error("clipboard denied"); }, (kind, message) => events.push(`${kind}: ${message}`));
  assert.deepEqual(events, ["error: Failed to copy to clipboard"]);
});

test("an unavailable or empty path performs no clipboard write and emits no toast", async () => {
  const events: string[] = [];
  for (const path of [null, ""]) {
    await copySettingsPath(path, async (value) => { events.push(value); }, (kind, message) => events.push(`${kind}: ${message}`));
  }
  assert.deepEqual(events, []);
});
