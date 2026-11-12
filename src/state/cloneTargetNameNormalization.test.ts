import assert from "node:assert/strict";
import test from "node:test";
import { cloneTargetName } from "./cloneDialog.ts";

const regressions = [
  ["HTTPS mixed case", "https://github.com/acme/MyRepo.git", "myrepo"],
  ["SCP mixed case", "git@github.com:acme/MyRepo.git", "myrepo"],
  ["HTTPS repeated hyphens and trailing slash", "https://github.com/acme/my--repo.git/", "my-repo"],
  ["SCP mixed case with dots and underscores", "git@github.com:acme/Repo_With.Mixed.git", "repo_with.mixed"],
] satisfies ReadonlyArray<readonly [string, string, string]>;

for (const [label, url, expected] of regressions) {
  test("clone basename normalization: " + label, () => {
    assert.equal(cloneTargetName(url), expected);
  });
}

const controls = [
  ["lowercase HTTPS", "https://github.com/acme/my-repo.git", "my-repo"],
  ["lowercase SCP", "git@github.com:acme/my-repo.git", "my-repo"],
  ["dots and underscores", "https://github.com/acme/repo_with.mixed.git", "repo_with.mixed"],
  ["local path basename", "/synthetic/remotes/My App", "My App"],
] satisfies ReadonlyArray<readonly [string, string, string]>;

for (const [label, url, expected] of controls) {
  test("clone basename control: " + label, () => {
    assert.equal(cloneTargetName(url), expected);
  });
}
