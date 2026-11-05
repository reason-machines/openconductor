import { test } from "node:test";
import assert from "node:assert/strict";
import { baseUrlError, blankToNull, branchPrefixError, branchPreview, normalizeCustomPrefix, withField } from "./model.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

test("withField changes one field and keeps everything else, unknown keys included", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, future: { a: 1 } };
  const next = withField(s, "general", "theme", "dark");
  assert.equal(next.general.theme, "dark");
  assert.equal(next.general.send_native_notification, true);
  assert.deepEqual(next.future, { a: 1 });
  assert.equal(next.models, s.models);
  assert.equal(s.general.theme, "system", "input is not mutated");
});

test("blank text inputs become null", () => {
  assert.equal(blankToNull("  "), null);
  assert.equal(blankToNull(" eu-west-1 "), "eu-west-1");
});

test("branch prefix rules match the backend's", () => {
  for (const ok of ["sven", "team/sven", "feat-1", " sven "]) assert.equal(branchPrefixError(ok), null, ok);
  for (const bad of ["", "a..b", "-x", ".x", "/x", "a b", "x.lock", "a/", "a.", "a//b", "a@{b", "a:b", "a~b", "a^b", "a?b", "a*b", "a[b", "a\\b", "a\tb"])
    assert.notEqual(branchPrefixError(bad), null, JSON.stringify(bad));
});

test("branch preview is the branch the Create-workspace flow would make", () => {
  const custom = (v: string) => withField(withField(DEFAULT_SETTINGS, "git", "branch_prefix_type", "custom"), "git", "branch_prefix_custom", v);
  assert.equal(branchPreview(custom("team"), "sven"), "team/tokyo");
  assert.equal(branchPreview(custom("team/sven"), null, "x"), "team/sven/x");
  assert.equal(branchPreview(DEFAULT_SETTINGS, "SvenM", "x"), "svenm/x");
  assert.equal(branchPreview(DEFAULT_SETTINGS, null, "x"), "x", "no username known: no prefix, as the dialog does");
  assert.equal(branchPreview(withField(DEFAULT_SETTINGS, "git", "branch_prefix_type", "none"), "sven", "x"), "x");
});

test("custom prefixes drop the trailing slash the backend refuses", () => {
  assert.equal(normalizeCustomPrefix(" feature/ "), "feature");
  assert.equal(normalizeCustomPrefix("team/sven//"), "team/sven");
  assert.equal(branchPrefixError(normalizeCustomPrefix("feature/")), null);
  assert.equal(normalizeCustomPrefix("/"), "");
  assert.notEqual(branchPrefixError(normalizeCustomPrefix("/")), null);
});

test("base URLs must be http(s) when set", () => {
  assert.equal(baseUrlError(""), null);
  assert.equal(baseUrlError("https://gateway.example/v1"), null);
  assert.notEqual(baseUrlError("ftp://x"), null);
  assert.notEqual(baseUrlError("https://a b"), null);
});

test("C1 control characters are refused like the backend's char::is_control", () => {
  assert.notEqual(branchPrefixError("a\u0085b"), null);
});

test("providers default to none configured, so every agent uses its CLI login", () => {
  assert.deepEqual(DEFAULT_SETTINGS.providers, {});
});
