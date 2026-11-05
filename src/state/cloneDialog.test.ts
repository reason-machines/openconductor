import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLONE_LOG_LIMIT,
  appendLog,
  cloneTargetName,
  canClone,
  cloneButtonLabel,
  cloneErrorMessage,
  initialLocation,
  isSelectedRepo,
  logText,
  recentRepoUrl,
  toHttpsUrl,
  toSshUrl,
  urlPlaceholder,
  validateClone,
  type RecentRepo,
} from "./cloneDialog.ts";

const repo: RecentRepo = {
  id: 1,
  full_name: "acme/web",
  description: null,
  clone_url: "https://github.com/acme/web.git",
  ssh_url: "git@github.com:acme/web.git",
  owner: { avatar_url: "https://avatars.example/acme" },
};

test("placeholder follows gh's git_protocol", () => {
  assert.equal(urlPlaceholder("ssh"), "git@github.com:user/repo.git");
  assert.equal(urlPlaceholder("https"), "https://github.com/user/repo.git");
  assert.equal(urlPlaceholder(undefined), "https://github.com/user/repo.git");
});

test("validation reports the URL first, then the location", () => {
  assert.equal(validateClone("", ""), "Enter a repository URL");
  assert.equal(validateClone("x", ""), "Select a directory");
  assert.equal(validateClone("x", "/tmp"), null);
  assert.equal(canClone("x", "/tmp", false), true);
  assert.equal(canClone("x", "/tmp", true), false);
  assert.equal(canClone("", "/tmp", false), false);
  assert.equal(cloneButtonLabel(true), "Cloning...");
  assert.equal(cloneButtonLabel(false), "Clone repo");
});

test("recent repo picks the URL for the protocol and highlights either form", () => {
  assert.equal(recentRepoUrl(repo, "ssh"), repo.ssh_url);
  assert.equal(recentRepoUrl(repo, undefined), repo.clone_url);
  assert.equal(isSelectedRepo(repo, repo.ssh_url), true);
  assert.equal(isSelectedRepo(repo, repo.clone_url), true);
  assert.equal(isSelectedRepo(repo, "https://github.com/acme/api.git"), false);
});

test("progress log keeps the newest lines and shows the newest first", () => {
  let log: string[] = [];
  for (let i = 0; i < 60; i++) log = appendLog(log, `line ${i}`);
  assert.equal(log.length, CLONE_LOG_LIMIT);
  assert.equal(log[0], "line 9");
  assert.equal(logText(["a", "b", "c"]), "c\nb\na");
});

test("location: saved folder if it still exists, else the default", () => {
  assert.equal(initialLocation("/src", true, "/home/me/repos"), "/src");
  assert.equal(initialLocation("/src", false, "/home/me/repos"), "/home/me/repos");
  assert.equal(initialLocation(null, false, "/home/me/repos"), "/home/me/repos");
});

test("URL conversion between HTTPS and SSH", () => {
  assert.equal(toSshUrl("https://github.com/acme/web.git"), "git@github.com:acme/web.git");
  assert.equal(toSshUrl("https://github.com/acme/web"), undefined);
  assert.equal(toHttpsUrl("git@github.com:acme/web.git"), "https://github.com/acme/web.git");
  assert.equal(toHttpsUrl("git@github.com:acme/web"), "https://github.com/acme/web.git");
  assert.equal(toHttpsUrl("ssh://git@github.com:22/acme/web.git"), "https://github.com/acme/web.git");
  assert.equal(toHttpsUrl("https://github.com/acme/web.git"), undefined);
});

test("clone errors map to repo-not-found, HTTPS auth, SSH key, or the raw message", () => {
  const map = (errorMessage: string, remoteUrl: string, prefersSshUrls = false) =>
    cloneErrorMessage({ errorMessage, remoteUrl, prefersSshUrls });
  const https = "https://github.com/acme/web.git";
  const ssh = "git@github.com:acme/web.git";
  assert.equal(
    map("Git clone failed with code 128\n\nSTDOUT:\nremote: Repository not found.", https),
    "Repository not found. Double-check the URL and make sure you have access",
  );
  assert.match(map("fatal: could not read Username for 'https://github.com'", https), /Run "gh auth login".*git@github\.com:acme\/web\.git$/);
  assert.match(map("Authentication failed for 'https://github.com/acme/web.git/'", https, true), /set up for SSH .* git@github\.com:acme\/web\.git$/);
  assert.equal(
    map("git@github.com: Permission denied (publickey).", ssh),
    "Git couldn't authenticate over SSH. Check your SSH keys, or use the HTTPS URL instead: https://github.com/acme/web.git",
  );
  // No convertible URL: falls through to the raw message.
  assert.equal(map("Authentication failed", "https://github.com/acme/web"), "Couldn't clone repo: Authentication failed");
  // "not found" without exit code 128 is not mapped.
  assert.equal(map("host not found", https), "Couldn't clone repo: host not found");
});

test("cloneTargetName takes the last path segment without .git", () => {
  assert.equal(cloneTargetName("https://github.com/acme/web.git"), "web");
  assert.equal(cloneTargetName("git@github.com:acme/web.git"), "web");
  assert.equal(cloneTargetName("git@github.com:web"), "web");
  assert.equal(cloneTargetName("https://github.com/acme/web/"), "web");
  assert.equal(cloneTargetName(".."), "repo");
});
