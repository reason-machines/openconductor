// Conductor's "lisbon" reference turn (tools/screens/seed-data.js, invented data)
// as the transcript blocks each of our agents produces for it:
// - claude: Claude Code through claude_chat (title "Name: detail", toolName + rawInput)
// - reason: Reason over ACP (ACP kind, title, paths, diffs and rawInput; no tool name)
// - codex:  Codex items as codex.ts keeps them (commandExecution with commandActions, fileChange)
// Shared by the transcript fixture and tests, so the three must render the same rows.
import type { Block } from "../../src/features/chat/types.ts";

export type FixtureAgent = "claude" | "reason" | "codex";

const WS = "/Users/demo/code/tide-web/lisbon";

export const LISBON = {
  workspacePath: WS,
  prompt: "After signing in, users with an expired session get bounced between /login and /dashboard forever. Can you find out why and fix it?",
  /** 10:29 UTC; the turn takes 8 minutes ("8m, 0s · 10:37 AM"). */
  startedAt: Date.UTC(2026, 10, 5, 10, 29, 0),
  durationSeconds: 480,
  changes: [
    { path: "src/lib/auth.ts", additions: 1, deletions: 1 },
    { path: "src/lib/auth.test.ts", additions: 14, deletions: 0 },
  ],
};

const text = (t: string): Block => ({ type: "text", text: t });
const result = (id: string, content: string): Block => ({ type: "tool_result", toolUseId: id, content });

const GREP_OUT = 'src/routes/login.tsx:18:  const redirectTo = search.next ?? "/dashboard";\nsrc/lib/auth.ts:42:export function redirectTo(session) {';
const READ_OUT = 'export function redirectTo(session) {\n  if (session) return "/dashboard";\n  return "/login";\n}';
const OLD = '  if (session) return "/dashboard";';
const NEW = '  if (session && session.expiresAt > Date.now()) return "/dashboard";';
const AUTH = `${WS}/src/lib/auth.ts`;

const local = (raw: string) => ({ place: "local", relative: raw.startsWith(`${WS}/`) ? raw.slice(WS.length + 1) : null, raw });

/** The reason.ts input for an ACP-style tool row. */
function acp(id: string, title: string, kind: string, opts: { paths?: string[]; toolName?: string; rawInput?: unknown; diffs?: { path: string; oldText: string | null; newText: string }[] }): Block {
  const paths = [...(opts.paths ?? []), ...(opts.diffs ?? []).map((d) => d.path)].map(local);
  return {
    type: "tool_use",
    id,
    name: title,
    input: {
      kind,
      paths,
      title,
      ...(opts.toolName ? { toolName: opts.toolName } : {}),
      ...(opts.rawInput ? { rawInput: opts.rawInput } : {}),
      ...(opts.diffs ? { diffs: opts.diffs.map((d) => ({ ...d, path: local(d.path) })) } : {}),
    },
  };
}

function tools(agent: FixtureAgent): Block[] {
  switch (agent) {
    case "claude":
      return [
        acp("g1", "Grep: redirectTo", "search", { toolName: "Grep", rawInput: { pattern: "redirectTo", path: "src" } }),
        acp("r1", "Read: src/lib/auth.ts", "read", { paths: [AUTH], toolName: "Read", rawInput: { file_path: AUTH } }),
        acp("e1", "Edit: src/lib/auth.ts", "edit", { toolName: "Edit", rawInput: { file_path: AUTH, old_string: OLD, new_string: NEW }, diffs: [{ path: AUTH, oldText: OLD, newText: NEW }] }),
        acp("b1", "Bash: pnpm test src/lib/auth.test.ts", "execute", { toolName: "Bash", rawInput: { command: "pnpm test src/lib/auth.test.ts", description: "Run the auth tests" } }),
      ];
    case "reason":
      return [
        acp("g1", "grep: redirectTo", "search", { rawInput: { pattern: "redirectTo", path: "src" } }),
        acp("r1", "read: src/lib/auth.ts", "read", { paths: [AUTH], rawInput: { file_path: AUTH } }),
        acp("e1", "edit: src/lib/auth.ts", "edit", { diffs: [{ path: AUTH, oldText: OLD, newText: NEW }] }),
        acp("b1", "bash: pnpm test src/lib/auth.test.ts", "execute", { rawInput: { command: "pnpm test src/lib/auth.test.ts", description: "Run the auth tests" } }),
      ];
    case "codex":
      return [
        { type: "tool_use", id: "g1", name: "rg -n redirectTo src", input: { command: "/bin/zsh -lc 'rg -n redirectTo src'", cwd: WS, commandActions: [{ type: "search", query: "redirectTo", path: "src" }] } },
        { type: "tool_use", id: "r1", name: "sed -n 1,80p src/lib/auth.ts", input: { command: "/bin/zsh -lc 'sed -n 1,80p src/lib/auth.ts'", cwd: WS, commandActions: [{ type: "read", path: AUTH }] } },
        { type: "tool_use", id: "e1", name: `Edit ${AUTH}`, input: { changes: [{ path: AUTH, kind: { type: "update" }, diff: `@@ -42,3 +42,3 @@\n export function redirectTo(session) {\n-${OLD}\n+${NEW}\n   return "/login";` }] } },
        { type: "tool_use", id: "b1", name: "pnpm test src/lib/auth.test.ts", input: { command: "/bin/zsh -lc 'pnpm test src/lib/auth.test.ts'", cwd: WS } },
      ];
  }
}

/** The assistant message's blocks: text, Grep, Read, text, Edit, Bash, final text. */
export function lisbonBlocks(agent: FixtureAgent): Block[] {
  const [grep, read, edit, bash] = tools(agent) as [Block, Block, Block, Block];
  return [
    text("I'll look at how the login route decides where to send a signed-in user."),
    grep,
    result("g1", GREP_OUT),
    read,
    result("r1", READ_OUT),
    text("Found it. `redirectTo` treats any session object as signed in, including an expired one, while the dashboard loader rejects expired sessions and sends the user back to `/login`. I'll check `expiresAt` before redirecting."),
    edit,
    result("e1", "ok"),
    bash,
    result("b1", "4 passed"),
    text("Fixed. Expired sessions now go straight to `/login` instead of looping.\n\n- `src/lib/auth.ts`: only redirect to the dashboard when the session has not expired.\n- Tests: `pnpm test src/lib/auth.test.ts` passes (4 tests)."),
  ];
}
