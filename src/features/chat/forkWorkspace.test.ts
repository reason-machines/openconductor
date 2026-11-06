// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { forkToNewWorkspace, nextBranchName, uniqueBranchName, type ForkWorkspaceInput } from "./forkWorkspace.ts";
import type { CreateWorkspaceArgs } from "../../workspace/createFlow.ts";
import type { CreatedWorkspaceDto } from "../../workspace/api.ts";

type Call = [string, Record<string, unknown>];

function fakes(opts: { checkpoint?: boolean; head?: { stdout: string; exitCode: number }; taken?: string[]; branchExit?: number; copyFails?: boolean } = {}) {
  const calls: Call[] = [];
  const created: CreateWorkspaceArgs[] = [];
  const invoke = async (cmd: string, args: Record<string, unknown>) => {
    calls.push([cmd, args]);
    if (cmd === "checkpoint_exists") return opts.checkpoint ?? true;
    if (cmd === "branch_name_is_taken") return (opts.taken ?? ["feature"]).includes(args.branchName as string);
    if (cmd === "checkpoint_restore") return null;
    if (cmd === "execute_shell_command") {
      const command = (args.request as { command: string }).command;
      if (command.startsWith("git symbolic-ref")) return { stderr: "", ...(opts.head ?? { stdout: "feature\n", exitCode: 0 }) };
      if (command.startsWith("git branch")) return opts.branchExit ? { stdout: "", stderr: "fatal: bad ref", exitCode: opts.branchExit } : { stdout: "", stderr: "", exitCode: 0 };
      if (opts.copyFails) throw new Error("copy failed");
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    throw new Error(`unexpected ${cmd}`);
  };
  const createWorkspace = async (args: CreateWorkspaceArgs): Promise<CreatedWorkspaceDto> => {
    created.push(args);
    const path = `/ws/${args.directoryName}`;
    return {
      workspace: { id: `repo/${args.directoryName}`, repositoryId: args.repositoryId, directoryName: args.directoryName, path, branchName: args.branchName, state: "active", head: null },
      baseRef: args.branchName,
      baseCommit: "",
      fetched: false,
      copiedFiles: [],
      upstreamWarning: null,
      initializationLogPath: null,
      initializationFilesCopied: 0,
      auxiliaryFailureMessage: null,
      number: 7,
    };
  };
  return { deps: { invoke, createWorkspace }, calls, created };
}

const input = (over: Partial<ForkWorkspaceInput> = {}): ForkWorkspaceInput => ({
  repositoryId: "repo",
  repoRoot: "/repo",
  workspacePath: "/ws/oslo",
  targetBranch: "main",
  directoryName: "lima",
  chatId: "repo/oslo",
  turnId: "repo/oslo:t5",
  transcript: "## User\n\nhi\n\n## Assistant\n\nhello",
  ...over,
});

test("branch names step like Conductor's makeBranchNameUnique: x, x-v1, x-v2", async () => {
  assert.equal(nextBranchName("feature"), "feature-v1");
  assert.equal(nextBranchName("feature-v1"), "feature-v2");
  assert.equal(nextBranchName("sven/fix-v9"), "sven/fix-v10");
  assert.equal(await uniqueBranchName("feature", async (b) => ["feature", "feature-v1"].includes(b)), "feature-v2");
  assert.equal(await uniqueBranchName("fresh", async () => false), "fresh");
});

test("a fork branches from the current branch in the main worktree, creates the workspace on it and restores the turn's end checkpoint", async () => {
  const { deps, calls, created } = fakes({ taken: ["feature", "feature-v1"] });
  const fork = await forkToNewWorkspace(deps, input());
  assert.equal(fork.branch, "feature-v2");
  assert.equal(fork.created.workspace.path, "/ws/lima");
  assert.deepEqual(calls[0], ["checkpoint_exists", { workspacePath: "/ws/oslo", checkpointId: "session-repo-oslo-turn-t5-end" }]);
  assert.deepEqual(calls[1], ["execute_shell_command", { request: { command: "git symbolic-ref --quiet --short HEAD", cwd: "/ws/oslo" } }]);
  const branch = calls.find(([c, a]) => c === "execute_shell_command" && (a.request as { command: string }).command.startsWith("git branch"));
  assert.deepEqual(branch?.[1], { request: { command: "git branch 'feature-v2' 'feature'", cwd: "/repo" } });
  assert.deepEqual(created, [{ repositoryId: "repo", branchName: "feature-v2", directoryName: "lima", baseBranch: "main", existingBranch: true }]);
  const restore = calls.findIndex(([c]) => c === "checkpoint_restore");
  assert.deepEqual(calls[restore], ["checkpoint_restore", { workspacePath: "/ws/lima", checkpointId: "session-repo-oslo-turn-t5-end" }]);
  const copy = calls[restore + 1][1].request as { command: string; cwd: string };
  assert.equal(copy.cwd, "/ws/lima");
  assert.match(copy.command, /cp -R '\/ws\/oslo\/\.context'\/\. \.context\//);
});

test("each precondition fails with Conductor's message, before anything is created", async () => {
  const cases: [ReturnType<typeof fakes>, Partial<ForkWorkspaceInput>, string][] = [
    [fakes(), { workspacePath: null }, "Unable to fork chat: workspace not found"],
    [fakes({ checkpoint: false }), {}, "Unable to fork chat: checkpoint not found for this turn"],
    [fakes({ head: { stdout: "", exitCode: 1 } }), {}, "Cannot fork chat: HEAD is detached"],
    [fakes(), { transcript: null }, "Unable to fork chat: failed to generate chat transcript"],
    [fakes({ branchExit: 128 }), {}, "fatal: bad ref"],
  ];
  for (const [f, over, message] of cases) {
    await assert.rejects(forkToNewWorkspace(f.deps, input(over)), { message });
    assert.deepEqual(f.created, [], message);
    assert.ok(!f.calls.some(([c]) => c === "checkpoint_restore"), message);
  }
});

test("a failed .context copy still returns the fork", async () => {
  const { deps } = fakes({ copyFails: true });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const fork = await forkToNewWorkspace(deps, input());
    assert.equal(fork.branch, "feature-v1");
  } finally {
    console.warn = warn;
  }
});
