import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PR_SETTINGS, prSettings } from "./prSettings.ts";
import type { Settings } from "../../settings/types.ts";


test("PR settings default off and read the top-level keys", () => {
  assert.deepEqual(prSettings(null), DEFAULT_PR_SETTINGS);
  const base = {} as Settings;
  assert.deepEqual(prSettings(base), { automerge: false, optionalChecksBlock: false });
  assert.deepEqual(prSettings({ ...base, automerge_enabled: true, treat_optional_checks_as_blocking: true }), { automerge: true, optionalChecksBlock: true });
  assert.equal(prSettings({ ...base, automerge_enabled: "true" }).automerge, false);
});
