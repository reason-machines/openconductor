import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudSetupView, githubFullName, githubSummary, planDescription, progressLabel, repoSupportsCloud, type CloudSetupDto } from "./cloudSetup.ts";

const ready: CloudSetupDto = {
  signedIn: true,
  identity: { email: "ada@example.com", name: "Ada", workspaceName: "Reason Tests", workspaceSlug: "reason-tests", cloudReady: true },
  funding: { status: "ready", detail: "ok", actions: [] },
  agentsAvailable: true,
  repositories: ["acme/web", "Acme/API"],
  error: null,
};
const signedOut: CloudSetupDto = {
  signedIn: false,
  identity: null,
  funding: null,
  agentsAvailable: null,
  repositories: null,
  error: { code: "authentication_required", message: "Sign in with reason login or supply REASON_API_KEY for the selected API origin." },
};

test("every step done: 3/3 and complete", () => {
  const v = cloudSetupView(ready);
  assert.deepEqual(v, { plan: "done", agents: "done", github: "done", done: 3, complete: true });
  assert.equal(progressLabel(v), "3/3");
});

test("loading hides the count, like Conductor's titleSuffix while isLoading", () => {
  const v = cloudSetupView(null);
  assert.equal(v.done, undefined);
  assert.equal(progressLabel(v), undefined);
  assert.equal(v.complete, false);
});

test("signed out: the plan is to do, the rest unknown, 0/3", () => {
  const v = cloudSetupView(signedOut);
  assert.deepEqual(v, { plan: "todo", agents: "unknown", github: "unknown", done: 0, complete: false });
  assert.match(planDescription(signedOut), /^Sign in to Reason/);
  assert.equal(githubSummary(signedOut), "Sign in to Reason first.");
});

test("no CLI or another failure: the plan is unknown and says why", () => {
  const s = { ...signedOut, error: { code: "timeout", message: "`reason call getSelf` did not answer within 20 seconds" } };
  assert.equal(cloudSetupView(s).plan, "unknown");
  assert.equal(planDescription(s), s.error.message);
});

test("cloud not active or funding blocked keeps the plan to do", () => {
  const off = { ...ready, identity: { ...ready.identity!, cloudReady: false } };
  assert.equal(cloudSetupView(off).plan, "todo");
  assert.match(planDescription(off), /isn't active in Reason Tests/);
  const broke = { ...ready, funding: { status: "blocked", detail: "No credit.", actions: [{ code: "funding_required", actor: "workspace_admin", action: "Add credit." }] } };
  assert.equal(cloudSetupView(broke).plan, "todo");
  assert.equal(planDescription(broke), "Add credit.");
  // An older deployment that does not report cloud activation still counts.
  const unreported = { ...ready, identity: { ...ready.identity!, cloudReady: null } };
  assert.equal(cloudSetupView(unreported).plan, "done");
  assert.equal(planDescription(ready), "Signed in as ada@example.com in Reason Tests. Cloud workspaces run as Reason Sessions on Reason cloud computers.");
});

test("agents and GitHub steps", () => {
  assert.equal(cloudSetupView({ ...ready, agentsAvailable: false }).agents, "todo");
  assert.equal(cloudSetupView({ ...ready, agentsAvailable: null }).agents, "unknown");
  const none = { ...ready, repositories: [] };
  assert.equal(cloudSetupView(none).github, "todo");
  assert.match(githubSummary(none), /^No repositories yet/);
  assert.equal(githubSummary(ready), "Reaches 2 repositories.");
  assert.equal(githubSummary({ ...ready, repositories: ["a/b"] }), "Reaches 1 repository.");
  assert.equal(cloudSetupView({ ...ready, repositories: null }).github, "unknown");
  assert.equal(progressLabel(cloudSetupView(none)), "2/3");
});

test("a repository's GitHub name from its remote, and whether Reason reaches it", () => {
  assert.equal(githubFullName("https://github.com/acme/web.git"), "acme/web");
  assert.equal(githubFullName("git@github.com:acme/web.git"), "acme/web");
  assert.equal(githubFullName("ssh://git@github.com/acme/web"), "acme/web");
  assert.equal(githubFullName("https://gitlab.com/acme/web.git"), undefined);
  assert.equal(githubFullName(null), undefined);
  assert.equal(repoSupportsCloud(ready, "git@github.com:acme/api.git"), true);
  assert.equal(repoSupportsCloud(ready, "https://github.com/acme/other"), false);
  assert.equal(repoSupportsCloud(signedOut, "https://github.com/acme/web"), false);
});
