import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAILED_TO_CREATE,
  buildCreateRequest,
  prBranchName,
  newDraft,
  progressLabel,
  reduceProgress,
  selectFrom,
  toCreateWorkspaceArgs,
  workspaceState,
  type CreateEvent,
  type CreateFrom,
  type CreateProgress,
} from "./createFlow.ts";

const draft = () => newDraft({ repoId: "r1", defaultBranch: "develop", cityName: "oslo", agent: "claude", model: "opus", effort: "high" });
const pr: CreateFrom = { kind: "pr", number: 12, title: "Fix login", headBranch: "fix/login", baseBranch: "release" };
const issue: CreateFrom = { kind: "issue", provider: "linear", key: "ENG-7", title: "Crash on start", url: "https://linear.app/x/ENG-7" };

test("new drafts default the base branch to the repo default branch", () => {
  assert.equal(draft().baseBranch, "develop");
  assert.equal(newDraft({ repoId: null, defaultBranch: "", cityName: "oslo", agent: "a", model: "m", effort: "e" }).baseBranch, "main");
});

test("a generated city name becomes a placeholder branch with the prefix", () => {
  const r = buildCreateRequest({ ...draft(), firstMessage: "  add tests " }, "sven/");
  assert.ok(r.ok);
  assert.deepEqual(r.request.naming, {
    workspace_name: "oslo",
    branch: "sven/oslo",
    placeholder_branch_name: "sven/oslo",
    user_set_workspace_name: false,
    user_set_branch_name: false,
  });
  assert.equal(r.request.startPoint, "develop");
  assert.equal(r.request.targetBranch, "develop");
  assert.equal(r.request.existingBranch, false);
  assert.deepEqual(r.request.firstSession, { agent: "claude", model: "opus", effort: "high", message: "add tests" });
});

test("no first session without a first message", () => {
  const r = buildCreateRequest(draft(), "");
  assert.ok(r.ok && r.request.firstSession === null);
});

test("a typed name is user-set and never a placeholder", () => {
  const r = buildCreateRequest({ ...draft(), name: "auth-fix", nameEdited: true }, "");
  assert.ok(r.ok);
  assert.equal(r.request.naming.user_set_workspace_name, true);
  assert.equal(r.request.naming.placeholder_branch_name, null);
});

test("validation errors: repo, workspace name, base branch", () => {
  const r = buildCreateRequest({ ...draft(), repoId: null, name: "bad name", baseBranch: " " }, "");
  assert.deepEqual(r, { ok: false, errors: { repo: "Choose a repository", name: "Invalid workspace name", baseBranch: "No branch name" } });
});

test("create from PR starts on the PR branch and targets the PR base", () => {
  const d = selectFrom(draft(), pr);
  assert.equal(d.baseBranch, "release");
  const r = buildCreateRequest(d, "sven/");
  assert.ok(r.ok);
  assert.equal(r.request.naming.branch, "fix/login");
  assert.equal(r.request.naming.user_set_branch_name, true);
  assert.equal(r.request.startPoint, "fix/login");
  assert.equal(r.request.targetBranch, "release");
  assert.equal(r.request.existingBranch, true);
});

test("create from branch checks out that branch; a bad branch is an error", () => {
  const r = buildCreateRequest(selectFrom(draft(), { kind: "branch", name: "feature/x" }), "sven/");
  assert.ok(r.ok && r.request.naming.branch === "feature/x" && r.request.targetBranch === "develop");
  const bad = buildCreateRequest(selectFrom(draft(), { kind: "branch", name: "" }), "");
  assert.deepEqual(bad, { ok: false, errors: { from: "No branch name" } });
});

test("create from issue seeds the composer, and clearing removes only the seed", () => {
  const d = selectFrom(draft(), issue);
  assert.match(d.firstMessage, /^Work on Linear issue ENG-7: Crash on start/);
  const r = buildCreateRequest(d, "");
  assert.ok(r.ok && r.request.naming.placeholder_branch_name === "oslo" && r.request.firstSession !== null);
  assert.equal(selectFrom(d, null).firstMessage, "");
  const typed = selectFrom({ ...draft(), firstMessage: "mine" }, issue);
  assert.equal(typed.firstMessage, "mine");
  assert.equal(selectFrom({ ...d, firstMessage: "edited" }, null).firstMessage, "edited");
  assert.deepEqual(buildCreateRequest(selectFrom(draft(), { ...issue, key: " " }), ""), {
    ok: false,
    errors: { from: "Cannot create workspace from this issue" },
  });
});

const run = (events: CreateEvent[]): CreateProgress => events.reduce(reduceProgress, { step: "idle" } as CreateProgress);

test("lifecycle with a setup script: initializing -> setting_up, and setup keeps running after the dialog", () => {
  const steps: CreateEvent[] = [{ type: "submit" }, { type: "created", workspaceId: "w1" }, { type: "setup_detected", started: true }];
  const seen: (string | null)[] = [];
  const labels: string[] = [];
  steps.reduce((p, e) => {
    const next = reduceProgress(p, e);
    seen.push(workspaceState(next));
    labels.push(progressLabel(next));
    return next;
  }, { step: "idle" } as CreateProgress);
  assert.deepEqual(seen, ["initializing", "setting_up", "setting_up"]);
  assert.deepEqual(labels, ["Creating workspace...", "Detecting setup script...", "Running setup script..."]);
  assert.deepEqual(run(steps), { step: "ready", workspaceId: "w1", setupStarted: true });
});

test("no setup script goes straight to ready", () => {
  const p = run([{ type: "submit" }, { type: "created", workspaceId: "w1" }, { type: "setup_detected", started: false }]);
  assert.deepEqual(p, { step: "ready", workspaceId: "w1", setupStarted: false });
  assert.equal(progressLabel(p), "Ready");
  assert.equal(workspaceState(p), "ready");
});

test("create failure shows the backend error or the generic one, and allows resubmit", () => {
  const a = run([{ type: "submit" }, { type: "create_failed", error: "branch already exists: sven/oslo" }]);
  assert.equal(progressLabel(a), "branch already exists: sven/oslo");
  const b = run([{ type: "submit" }, { type: "create_failed" }]);
  assert.equal(progressLabel(b), FAILED_TO_CREATE);
  assert.deepEqual(reduceProgress(b, { type: "submit" }), { step: "creating" });
});

test("out-of-order events are ignored", () => {
  assert.deepEqual(run([{ type: "created", workspaceId: "w1" }]), { step: "idle" });
  assert.deepEqual(run([{ type: "submit" }, { type: "setup_detected", started: true }]), { step: "creating" });
  assert.deepEqual(run([{ type: "submit" }, { type: "submit" }]), { step: "creating" });
});

test("requests map onto create_workspace arguments", () => {
  const r = buildCreateRequest(draft(), "sven/");
  assert.ok(r.ok);
  assert.deepEqual(toCreateWorkspaceArgs(r.request), {
    repositoryId: "r1",
    branchName: "sven/oslo",
    directoryName: "oslo",
    baseBranch: "develop",
    existingBranch: false,
  });
});

test("create from a PR or branch asks create_workspace to check that branch out", () => {
  const fromPr = buildCreateRequest(selectFrom(draft(), pr), "sven/");
  assert.ok(fromPr.ok);
  assert.deepEqual(toCreateWorkspaceArgs(fromPr.request), {
    repositoryId: "r1",
    branchName: "fix/login",
    directoryName: "oslo",
    baseBranch: "fix/login",
    existingBranch: true,
    prNumber: 12,
  });
  const fromBranch = buildCreateRequest(selectFrom(draft(), { kind: "branch", name: "feature/x" }), "sven/");
  assert.ok(fromBranch.ok);
  const args = toCreateWorkspaceArgs(fromBranch.request);
  assert.equal(args.branchName, "feature/x");
  assert.equal(args.existingBranch, true);
  assert.equal("prNumber" in args, false);
});

test("a fork PR is checked out as <owner>/<branch> and sends its PR number", () => {
  const fork = { kind: "pr" as const, number: 31, title: "Fork fix", headBranch: "main", baseBranch: "release", headOwner: "octocat", crossRepository: true };
  assert.equal(prBranchName(fork), "octocat/main");
  assert.equal(prBranchName({ ...fork, crossRepository: false }), "main");
  assert.equal(prBranchName({ ...fork, headOwner: " " }), "main");
  const r = buildCreateRequest(selectFrom(draft(), fork), "sven/");
  assert.ok(r.ok);
  const args = toCreateWorkspaceArgs(r.request);
  assert.equal(args.branchName, "octocat/main");
  assert.equal(args.baseBranch, "octocat/main");
  assert.equal(args.existingBranch, true);
  assert.equal(args.prNumber, fork.number);
});
