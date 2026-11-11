import { test } from "node:test";
import assert from "node:assert/strict";
import { branchPrefixError, branchPreview, normalizeCustomPrefix } from "./model.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";
import { applyBranchPrefix, prefixSettingsFromInfo, resolveBranchPrefix } from "../workspace/naming.ts";

for (const [input, expected] of [
  ["myname-", "myname-tokyo"],
  ["team_", "team_tokyo"],
  ["team/ui-", "team/ui-tokyo"],
  ["Team.UI-", "Team.UI-tokyo"],
  ["feature/", "feature/tokyo"],
  ["team", "team/tokyo"],
]) {
  test(`custom branch prefix ${JSON.stringify(input)} agrees in Settings and workspace naming`, () => {
    const stored = normalizeCustomPrefix(input);
    assert.equal(branchPrefixError(stored), null);
    const settings: Settings = { ...DEFAULT_SETTINGS, git: { ...DEFAULT_SETTINGS.git, branch_prefix_type: "custom", branch_prefix: stored } };
    assert.equal(branchPreview(settings, "other-user"), expected);
    const info = prefixSettingsFromInfo({ branchPrefixType: "custom", branchPrefix: stored, githubUsername: "other-user" });
    const prefix = resolveBranchPrefix(info.settings, info.githubUsername);
    assert.equal(applyBranchPrefix(prefix, "tokyo"), expected);
    assert.equal(applyBranchPrefix(prefix, expected), expected);
  });
}

test("custom-prefix handling leaves GitHub, None, and empty prefixes unchanged", () => {
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "github_username" }, "SvenM"), "svenm/");
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "none", branch_prefix: "myname-" }, "sven"), "");
  assert.equal(resolveBranchPrefix({ branch_prefix_type: "custom", branch_prefix: "  " }), "");
});
