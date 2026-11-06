// parity:chat.message-actions:data
// "Fork to new workspace" in a turn's More actions menu. As in Conductor 0.87.6
// (renderApp-D_fmY7hW.js `DIr`, mutation `forkChat`, with index-BGEQ8YjU.js
// `ensureLocalBranch`, `makeBranchNameUnique` (`CYe`/`hf`), `zj` and
// `copyContextFolder`; read on sven m5 max, see
// evidence/parity/chat-diff-pr/fork.md):
//
// 1. The turn's `end` checkpoint must exist and the workspace must be on a
//    branch (not a detached HEAD).
// 2. A new branch named after the current one ("<branch>-v1", "-v2", ...: the
//    first name no local or remote branch has) is created at the current
//    branch's tip, in the repository's main worktree.
// 3. A workspace is created on that branch with the source's target branch,
//    then restored to the checkpoint, so its files are as they were when that
//    turn ended.
// 4. The source's `.context` folder (attachments, plans, notes) is copied in.
//
// The caller attaches the transcript to the new chat's composer (not sent),
// opens it on the source chat's options and adds the workspace. Conductor also
// copies its workspace notes; we have no workspace notes.
//
// `invoke` and `createWorkspace` are parameters so the sequence is testable
// without Tauri.

import type { CreateWorkspaceArgs } from "../../workspace/createFlow.ts";
import type { CreatedWorkspaceDto } from "../../workspace/api.ts";
import { checkpointId, type Invoke } from "./checkpoints.ts";

export interface ForkWorkspaceDeps {
  invoke: Invoke;
  createWorkspace: (args: CreateWorkspaceArgs) => Promise<CreatedWorkspaceDto>;
}

export interface ForkWorkspaceInput {
  /** Backend repository id (`add_repository`). */
  repositoryId: string;
  /** The repository's main worktree, where the new branch is made. */
  repoRoot: string;
  /** The source workspace's worktree. */
  workspacePath: string | null;
  /** Where the source's work merges back; the fork keeps it. */
  targetBranch: string;
  /** Folder name for the new workspace (a generated city name). */
  directoryName: string;
  chatId: string;
  turnId: string;
  /** The transcript up to the turn; null when nothing could be built. */
  transcript: string | null;
}

export interface ForkedWorkspace {
  created: CreatedWorkspaceDto;
  /** The new workspace's branch. */
  branch: string;
  transcript: string;
}

interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/** Conductor's `hf`: "x" becomes "x-v1", "x-v1" becomes "x-v2". */
export function nextBranchName(name: string): string {
  const m = name.match(/^(.+?)-v(\d+)$/);
  return m ? `${m[1]}-v${parseInt(m[2], 10) + 1}` : `${name}-v1`;
}

/** Conductor's `makeBranchNameUnique`: `name` itself if free, else the first free `nextBranchName` step. */
export async function uniqueBranchName(name: string, taken: (candidate: string) => Promise<boolean>): Promise<string> {
  let candidate = name;
  for (let i = 0; i < 1000; i++) {
    if (!(await taken(candidate))) return candidate;
    candidate = nextBranchName(candidate);
  }
  throw new Error("Failed to make branch name unique after 1000 attempts");
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

async function shell(invoke: Invoke, command: string, cwd: string): Promise<ShellOutput> {
  return (await invoke("execute_shell_command", { request: { command, cwd } })) as ShellOutput;
}

export async function forkToNewWorkspace(deps: ForkWorkspaceDeps, input: ForkWorkspaceInput): Promise<ForkedWorkspace> {
  const { invoke } = deps;
  const source = input.workspacePath;
  if (!source) throw new Error("Unable to fork chat: workspace not found");
  const checkpoint = checkpointId(input.chatId, input.turnId, "end");
  if (!(await invoke("checkpoint_exists", { workspacePath: source, checkpointId: checkpoint }))) {
    throw new Error("Unable to fork chat: checkpoint not found for this turn");
  }
  const head = await shell(invoke, "git symbolic-ref --quiet --short HEAD", source);
  const current = head.exitCode === 0 ? head.stdout.trim() : "";
  if (!current) throw new Error("Cannot fork chat: HEAD is detached");
  const branch = await uniqueBranchName(current, async (b) => (await invoke("branch_name_is_taken", { repositoryId: input.repositoryId, branchName: b })) as boolean);
  if (input.transcript === null) throw new Error("Unable to fork chat: failed to generate chat transcript");

  const made = await shell(invoke, `git branch ${quote(branch)} ${quote(current)}`, input.repoRoot);
  if (made.exitCode !== 0) throw new Error(made.stderr || made.stdout || "Failed to fork chat");

  const created = await deps.createWorkspace({
    repositoryId: input.repositoryId,
    branchName: branch,
    directoryName: input.directoryName,
    baseBranch: input.targetBranch,
    existingBranch: true,
  });
  const dest = created.workspace.path;
  await invoke("checkpoint_restore", { workspacePath: dest, checkpointId: checkpoint });

  // Conductor copies `.context` only when the new workspace has one too; ours
  // has none yet, so the folder is made. A failed copy does not undo the fork.
  const copy = await shell(invoke, `if [ -d ${quote(`${source}/.context`)} ]; then mkdir -p .context && cp -R ${quote(`${source}/.context`)}/. .context/; fi`, dest).catch(
    (e: unknown) => ({ stdout: "", stderr: String(e), exitCode: 1 }),
  );
  if (copy.exitCode !== 0) console.warn("fork: .context not copied", copy.stderr);

  return { created, branch, transcript: input.transcript };
}
