import { test } from "node:test";
import assert from "node:assert/strict";
import { isSignInFailure, signInCopy } from "./agentSignIn.ts";

test("Claude Code: Conductor's oVt rule", () => {
  assert.ok(isSignInFailure("claude", "Invalid API key · Please run /login"));
  assert.ok(isSignInFailure("claude", 'API Error: 401 {"type":"error","error":{"type":"authentication_error"}}'));
  assert.ok(isSignInFailure("claude", "401 Invalid authentication credentials"));
  assert.ok(!isSignInFailure("claude", "Invalid authentication credentials"), "needs the 401");
  assert.ok(!isSignInFailure("claude", "You've hit your weekly limit · resets Nov 11 at 1am"));
  assert.ok(!isSignInFailure("claude", "Anthropic's API is overloaded"));
});

test("Codex: the app server's 401 and CLI login messages", () => {
  assert.ok(isSignInFailure("codex", "unexpected status 401 Unauthorized"));
  assert.ok(isSignInFailure("codex", "Not logged in. Run `codex login`."));
  assert.ok(!isSignInFailure("codex", "You've hit your usage limit"));
});

test("Reason and empty errors", () => {
  assert.ok(isSignInFailure("reason", "Not signed in. Run `reason login`."));
  assert.ok(isSignInFailure("reason", "Authentication required: Sign in to Reason."));
  assert.ok(isSignInFailure("reason", "authentication_required"));
  assert.ok(!isSignInFailure("reason", undefined));
  assert.ok(!isSignInFailure("reason", "The turn failed."));
});

test("copy names the agent", () => {
  assert.equal(signInCopy("reason").action, "Sign in to Reason");
  assert.match(signInCopy("reason").text, /automatically/);
  assert.equal(signInCopy("codex").action, "Open Codex settings");
  assert.match(signInCopy("claude").text, /^Claude Code is not signed in/);
});
