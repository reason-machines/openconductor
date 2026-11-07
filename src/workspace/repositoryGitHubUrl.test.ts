import assert from "node:assert/strict";
import test from "node:test";
import { repositoryGitHubUrl } from "./repositoryGitHubUrl.ts";

test("repository header opens the canonical GitHub page, not a clone URL or credential-bearing remote", () => {
  for (const remote of [
    "https://github.com/tide-labs/tide-web.git",
    "git@github.com:tide-labs/tide-web.git",
    "ssh://git@github.com/tide-labs/tide-web.git",
    "https://user:password@github.com/tide-labs/tide-web.git?token=private#fragment",
    " https://github.com/tide-labs/tide-web/ ",
  ]) assert.equal(repositoryGitHubUrl(remote), "https://github.com/tide-labs/tide-web");
});

test("local, malformed and non-GitHub repositories have no Open on GitHub action", () => {
  for (const remote of [undefined, "", "/Users/demo/code", "https://gitlab.com/tide/web", "https://github.com.evil.test/tide/web", "javascript:alert(1)", "https://github.com/owner", "https://github.com/owner/repo/tree/main", "https://github.com/owner/.git"]) {
    assert.equal(repositoryGitHubUrl(remote), null);
  }
});
