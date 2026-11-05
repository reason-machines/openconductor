import assert from "node:assert/strict";
import { test } from "node:test";
import { boolPref, enumPref, withBoolPref, withEnumPref } from "./prefs.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

test("unset prefs read as Conductor's defaults", () => {
  assert.equal(boolPref(DEFAULT_SETTINGS, "auto_convert_long_text"), true);
  assert.equal(boolPref(DEFAULT_SETTINGS, "mention_notifications_enabled"), true);
  assert.equal(boolPref(DEFAULT_SETTINGS, "github_stacked_prs_enabled"), true);
  assert.equal(boolPref(DEFAULT_SETTINGS, "internal_remote_local_execution_mcp"), true);
  assert.equal(boolPref(DEFAULT_SETTINGS, "not_absolutely_right"), false);
  assert.equal(boolPref(DEFAULT_SETTINGS, "automerge_enabled"), false);
  assert.equal(enumPref(DEFAULT_SETTINGS, "default_message_send_mode"), "steering");
  assert.equal(enumPref(DEFAULT_SETTINGS, "pull_request_open_target"), "github");
});

test("a write lands in the key's section and reads back", () => {
  const s = withBoolPref(DEFAULT_SETTINGS, "voice_mode", true);
  assert.equal((s.experimental as Record<string, unknown>).voice_mode, true);
  assert.equal(boolPref(s, "voice_mode"), true);
  const top = withBoolPref(DEFAULT_SETTINGS, "automerge_enabled", true);
  assert.equal(top.automerge_enabled, true);
  const g = withEnumPref(DEFAULT_SETTINGS, "pull_request_open_target", "graphite");
  assert.equal((g.git as Record<string, unknown>).pull_request_open_target, "graphite");
  assert.equal(enumPref(g, "pull_request_open_target"), "graphite");
});

test("values of the wrong type fall back to the default", () => {
  const s = { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, auto_convert_long_text: "false" } };
  assert.equal(boolPref(s, "auto_convert_long_text"), true);
  const e = { ...DEFAULT_SETTINGS, git: { ...DEFAULT_SETTINGS.git, pull_request_open_target: "gitlab" } };
  assert.equal(enumPref(e, "pull_request_open_target"), "github");
});
