// Invented content for populated scenarios: an imaginary "tide" product with
// three repos, workspaces in every status, and one chat transcript with tool
// calls. No real people, repositories, paths or tokens.
(function () {
  const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const insert = (table, row) => `INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(q).join(", ")});`;

  // Fixed "now" so relative times ("2h ago") stay stable between captures is not
  // possible without freezing Date; times are relative to the capture instead.
  const now = Date.now();
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString().replace("T", " ").slice(0, 19);

  const repos = [
    { id: "repo-tide-web", name: "tide-web", remote_url: "git@github.com:tide-labs/tide-web.git", default_branch: "main", root_path: "/Users/demo/code/tide-web", display_order: 0, remote: "origin" },
    { id: "repo-tide-api", name: "tide-api", remote_url: "git@github.com:tide-labs/tide-api.git", default_branch: "main", root_path: "/Users/demo/code/tide-api", display_order: 1, remote: "origin" },
    { id: "repo-dotfiles", name: "dotfiles", remote_url: "git@github.com:ada-demo/dotfiles.git", default_branch: "main", root_path: "/Users/demo/code/dotfiles", display_order: 2, remote: "origin" },
  ];

  // [local_id, repo, directory (city), branch, derived_status, session title, session status, minutes ago, unread, pr_title]
  const ws = [
    ["ws-lisbon", "repo-tide-web", "lisbon", "ada/fix-login-redirect", "in-progress", "Fix login redirect loop", "idle", 12, 0, null],
    ["ws-osaka", "repo-tide-web", "osaka", "ada/dark-mode-tokens", "in-progress", "Move colors to design tokens", "working", 3, 0, null],
    ["ws-quito", "repo-tide-web", "quito", "ada/settings-search", "in-review", "Add search to settings", "idle", 95, 1, "Add search to settings"],
    ["ws-tallinn", "repo-tide-api", "tallinn", "ada/rate-limit-headers", "in-progress", "Return rate limit headers", "needs_user_permission", 6, 1, null],
    ["ws-accra", "repo-tide-api", "accra", "ada/pagination-cursor", "done", "Cursor pagination for /events", "idle", 1440, 0, "Cursor pagination for /events"],
    ["ws-bergen", "repo-dotfiles", "bergen", "ada/zsh-prompt", "in-progress", "Speed up zsh prompt", "idle", 300, 0, null],
  ];

  const sql = [];
  for (const r of repos) sql.push(insert("repos", { ...r, created_at: iso(60 * 24 * 30), updated_at: iso(60) }));
  ws.forEach(([id, repo, dir, branch, status, title, sstatus, ago, unread, pr], i) => {
    const sessionId = `sess-${dir}`;
    sql.push(
      insert("workspaces", {
        local_id: id,
        repository_id: repo,
        directory_name: dir,
        branch,
        state: "ready",
        derived_status: status,
        active_session_id: sessionId,
        unread,
        initialization_parent_branch: "main",
        intended_target_branch: "main",
        pr_title: pr,
        number: i + 1,
        created_at: iso(ago + 60),
        updated_at: iso(ago),
      }),
    );
    sql.push(
      insert("sessions", {
        id: sessionId,
        workspace_id: id,
        status: sstatus,
        title,
        // A capture may run the chats on Codex (window.__OC_SESSION_AGENT__ = "codex").
        model: window.__OC_SESSION_AGENT__ === "codex" ? "gpt-5.5" : "claude-opus-4-8",
        agent_type: window.__OC_SESSION_AGENT__ === "codex" ? "codex" : "claude",
        permission_mode: "default",
        unread_count: unread,
        context_token_count: 18400 + i * 3100,
        context_used_percent: 9 + i * 2,
        last_user_message_at: iso(ago + 5),
        created_at: iso(ago + 60),
        updated_at: iso(ago),
      }),
    );
  });

  // One full transcript in the "lisbon" workspace.
  const S = "sess-lisbon";
  let row = 0;
  const msgs = [];
  const user = (id, text, ago) => {
    msgs.push({ id, session_id: S, role: "user", content: text, created_at: iso(ago), sent_at: iso(ago), turn_id: id, model: "claude-opus-4-8" });
    return id;
  };
  const assistant = (turn, content, ago, sdk) =>
    msgs.push({
      id: `m-${S}-${++row}`,
      session_id: S,
      role: "assistant",
      content: JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4-8", content }, session_id: "claude-demo-1" }),
      created_at: iso(ago),
      sent_at: iso(ago),
      turn_id: turn,
      sdk_message_id: sdk,
      model: "claude-opus-4-8",
    });
  const toolResult = (turn, id, text, ago) =>
    msgs.push({
      id: `m-${S}-${++row}`,
      session_id: S,
      role: "assistant",
      content: JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: text }] }, session_id: "claude-demo-1" }),
      created_at: iso(ago),
      sent_at: iso(ago),
      turn_id: turn,
      model: "claude-opus-4-8",
    });
  const result = (turn, ago) =>
    msgs.push({
      id: `m-${S}-${++row}`,
      session_id: S,
      role: "assistant",
      content: JSON.stringify({ type: "result", subtype: "success", session_id: "claude-demo-1", total_cost_usd: 0.42, num_turns: 6, is_error: false, result: "done", usage: { input_tokens: 18200, output_tokens: 2400 } }),
      created_at: iso(ago),
      sent_at: iso(ago),
      turn_id: turn,
      model: "claude-opus-4-8",
    });

  const t1 = user("u-lisbon-1", "After signing in, users with an expired session get bounced between /login and /dashboard forever. Can you find out why and fix it?", 40);
  assistant(t1, [{ type: "text", text: "I'll look at how the login route decides where to send a signed-in user." }], 39, "sdk-1");
  assistant(t1, [{ type: "tool_use", id: "tu-1", name: "Grep", input: { pattern: "redirectTo", path: "src" } }], 39, "sdk-2");
  toolResult(t1, "tu-1", "src/routes/login.tsx:18:  const redirectTo = search.next ?? \"/dashboard\";\nsrc/lib/auth.ts:42:export function redirectTo(session) {", 38);
  assistant(t1, [{ type: "tool_use", id: "tu-2", name: "Read", input: { file_path: "/Users/demo/code/tide-web/src/lib/auth.ts" } }], 38, "sdk-3");
  toolResult(t1, "tu-2", "export function redirectTo(session) {\n  if (session) return \"/dashboard\";\n  return \"/login\";\n}", 37);
  assistant(
    t1,
    [{ type: "text", text: "Found it. `redirectTo` treats any session object as signed in, including an expired one, while the dashboard loader rejects expired sessions and sends the user back to `/login`. I'll check `expiresAt` before redirecting." }],
    36,
    "sdk-4",
  );
  assistant(
    t1,
    [{ type: "tool_use", id: "tu-3", name: "Edit", input: { file_path: "/Users/demo/code/tide-web/src/lib/auth.ts", old_string: "  if (session) return \"/dashboard\";", new_string: "  if (session && session.expiresAt > Date.now()) return \"/dashboard\";" } }],
    35,
    "sdk-5",
  );
  toolResult(t1, "tu-3", "The file /Users/demo/code/tide-web/src/lib/auth.ts has been updated.", 35);
  assistant(t1, [{ type: "tool_use", id: "tu-4", name: "Bash", input: { command: "pnpm test src/lib/auth.test.ts", description: "Run the auth tests" } }], 34, "sdk-6");
  toolResult(t1, "tu-4", " ✓ src/lib/auth.test.ts (4 tests) 12ms\n\n Test Files  1 passed (1)\n      Tests  4 passed (4)", 33);
  assistant(
    t1,
    [{ type: "text", text: "Fixed. Expired sessions now go straight to `/login` instead of looping.\n\n- `src/lib/auth.ts`: only redirect to the dashboard when the session has not expired.\n- Tests: `pnpm test src/lib/auth.test.ts` passes (4 tests)." }],
    32,
    "sdk-7",
  );
  result(t1, 32);
  for (const m of msgs) sql.push(insert("session_messages", m));

  // Conductor marks a repo "unlinked" (and hides it) when root_path is missing,
  // so the virtual filesystem holds each repo root and workspace worktree.
  const vfs = {};
  const rootOf = Object.fromEntries(repos.map((r) => [r.id, r.root_path]));
  for (const r of repos) vfs[`${r.root_path}/.git/HEAD`] = "ref: refs/heads/main\n";
  for (const [, repo, dir, branch] of ws) vfs[`${rootOf[repo]}/${dir}/.git`] = `gitdir: ${rootOf[repo]}/.git/worktrees/${dir}\n`;

  // Data for the fake git in fixtures.js: worktrees per repo and one diff.
  // Before/after contents of the two changed files in "lisbon" (invented code).
  const AUTH_BEFORE = [
    'import { getSession } from "./session";',
    "",
    "export type Session = { userId: string; expiresAt: number };",
    "",
    "export async function currentSession(): Promise<Session | null> {",
    "  return (await getSession()) ?? null;",
    "}",
    "",
    "export function redirectTo(session) {",
    '  if (session) return "/dashboard";',
    '  return "/login";',
    "}",
    "",
  ].join("\n");
  const AUTH_AFTER = AUTH_BEFORE.replace('  if (session) return "/dashboard";', '  if (session && session.expiresAt > Date.now()) return "/dashboard";');
  const TEST_BEFORE = [
    'import { describe, expect, it } from "vitest";',
    'import { redirectTo } from "./auth";',
    "",
    'describe("redirectTo", () => {',
    '  it("sends signed-out users to /login", () => {',
    '    expect(redirectTo(null)).toBe("/login");',
    "  });",
    "});",
    "",
  ].join("\n");
  const TEST_AFTER = TEST_BEFORE.replace(
    "  });\n});",
    [
      "  });",
      "",
      '  it("sends expired sessions to /login", () => {',
      "    const expired = { expiresAt: Date.now() - 1000 };",
      '    expect(redirectTo(expired)).toBe("/login");',
      "  });",
      "",
      '  it("sends live sessions to the dashboard", () => {',
      "    const live = { expiresAt: Date.now() + 60_000 };",
      '    expect(redirectTo(live)).toBe("/dashboard");',
      "  });",
      "",
      '  it("treats a missing expiry as expired", () => {',
      '    expect(redirectTo({})).toBe("/login");',
      "  });",
      "});",
    ].join("\n"),
  );
  const LISBON = "/Users/demo/code/tide-web/lisbon";
  vfs[`${LISBON}/src/lib/auth.ts`] = AUTH_AFTER;
  vfs[`${LISBON}/src/lib/auth.test.ts`] = TEST_AFTER;

  const git = {
    repos: Object.fromEntries(
      repos.map((r) => [
        r.root_path,
        {
          branches: ["main", ...ws.filter((w) => w[1] === r.id).map((w) => w[3])],
          worktrees: ws.filter((w) => w[1] === r.id).map((w) => ({ path: `${r.root_path}/${w[2]}`, branch: w[3] })),
        },
      ]),
    ),
    diffs: {
      "/Users/demo/code/tide-web/lisbon": {
        base: { "src/lib/auth.ts": AUTH_BEFORE, "src/lib/auth.test.ts": TEST_BEFORE },
        files: [
          { path: "src/lib/auth.ts", added: 1, removed: 1 },
          { path: "src/lib/auth.test.ts", added: 14, removed: 0 },
        ],
        patch: [
          "diff --git a/src/lib/auth.ts b/src/lib/auth.ts",
          "index 3b18e51..9c2d4f0 100644",
          "--- a/src/lib/auth.ts",
          "+++ b/src/lib/auth.ts",
          "@@ -40,7 +40,7 @@ import { getSession } from \"./session\";",
          " ",
          " export function redirectTo(session) {",
          "-  if (session) return \"/dashboard\";",
          "+  if (session && session.expiresAt > Date.now()) return \"/dashboard\";",
          "   return \"/login\";",
          " }",
          " ",
          "diff --git a/src/lib/auth.test.ts b/src/lib/auth.test.ts",
          "index 1f0a2c3..7e4b5d6 100644",
          "--- a/src/lib/auth.test.ts",
          "+++ b/src/lib/auth.test.ts",
          "@@ -22,3 +22,17 @@ describe(\"redirectTo\", () => {",
          "   it(\"sends signed-out users to /login\", () => {",
          "     expect(redirectTo(null)).toBe(\"/login\");",
          "   });",
          "+",
          "+  it(\"sends expired sessions to /login\", () => {",
          "+    const expired = { expiresAt: Date.now() - 1000 };",
          "+    expect(redirectTo(expired)).toBe(\"/login\");",
          "+  });",
          "+",
          "+  it(\"sends live sessions to the dashboard\", () => {",
          "+    const live = { expiresAt: Date.now() + 60_000 };",
          "+    expect(redirectTo(live)).toBe(\"/dashboard\");",
          "+  });",
          "+",
          "+  it(\"treats a missing expiry as expired\", () => {",
          "+    expect(redirectTo({})).toBe(\"/login\");",
          "+  });",
          " });",
          "",
        ].join("\n"),
      },
    },
  };

  const populated = { conductor: sql.join("\n"), vfs, git };

  // "needs-permission": populated plus a turn in "tallinn" waiting on a Bash
  // approval. Conductor keeps tool approvals in memory only (index chunk
  // `enqueueToolApproval`, fed by the sidecar's `toolApproval` JSON-RPC request,
  // `Ke.addMethod(la.TOOL_APPROVAL, ...)`), so the mock sends that request once
  // the app listens on rpc_from_sidecar (tauri-mock.js `sidecarRequests`).
  // Same turn as tools/reason-acp/fake_reason_acp.py "tallinn".
  const TALLINN_PROMPT = "Return X-RateLimit-Limit and X-RateLimit-Remaining headers on every API response.";
  const TALLINN_COMMAND = { command: "pnpm test src/middleware/rate-limit.test.ts", description: "Run the rate limit tests" };
  const tallinnRow = (id, role, content, ago, extra = {}) =>
    insert("session_messages", { id, session_id: "sess-tallinn", role, content, created_at: iso(ago), sent_at: iso(ago), turn_id: "u-tallinn-1", model: "claude-opus-4-8", ...extra });
  const tallinnAssistant = (id, content, ago) =>
    tallinnRow(id, "assistant", JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4-8", content }, session_id: "claude-demo-2" }), ago, { sdk_message_id: `sdk-${id}` });
  const needsPermission = {
    ...populated,
    conductor: [
      populated.conductor,
      tallinnRow("u-tallinn-1", "user", TALLINN_PROMPT, 7),
      tallinnAssistant("m-tallinn-1", [{ type: "text", text: "I'll add both headers in the rate limit middleware, then run its tests." }], 6),
      tallinnAssistant("m-tallinn-2", [{ type: "tool_use", id: "tu-tallinn-1", name: "Bash", input: TALLINN_COMMAND }], 6),
    ].join("\n"),
    sidecarRequests: [
      { jsonrpc: "2.0", id: "oc-mock-approval-1", method: "toolApproval", params: { sessionId: "sess-tallinn", toolUseId: "tu-tallinn-1", toolName: "Bash", toolInput: TALLINN_COMMAND } },
    ],
  };
  // "two-turns": populated plus a second, shorter turn in "lisbon", so the first
  // turn is not the last one. Conductor's turn menu offers "Reset chat" only on
  // a turn before the last (renderApp `TDo`: `ue = ... && !isLastTurn && ...`).
  // Same second turn as tools/side-by-side/chat-tabs.mjs (LISBON_FOLLOW_UP).
  const LISBON_FOLLOW_UP = "Also cover a session that expires exactly now.";
  const second = [];
  const t2 = "u-lisbon-2";
  second.push(insert("session_messages", { id: t2, session_id: S, role: "user", content: LISBON_FOLLOW_UP, created_at: iso(20), sent_at: iso(20), turn_id: t2, model: "claude-opus-4-8" }));
  second.push(
    insert("session_messages", {
      id: `m-${S}-t2-1`,
      session_id: S,
      role: "assistant",
      content: JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4-8", content: [{ type: "text", text: "Done. A session whose `expiresAt` equals now counts as expired, and a test covers it." }] }, session_id: "claude-demo-1" }),
      created_at: iso(19),
      sent_at: iso(19),
      turn_id: t2,
      sdk_message_id: "sdk-8",
      model: "claude-opus-4-8",
    }),
  );
  second.push(insert("session_messages", { id: `m-${S}-t2-2`, session_id: S, role: "assistant", content: JSON.stringify({ type: "result", subtype: "success", session_id: "claude-demo-1", is_error: false, result: "done" }), created_at: iso(19), sent_at: iso(19), turn_id: t2, model: "claude-opus-4-8" }));
  const twoTurns = { ...populated, conductor: [populated.conductor, ...second].join("\n") };

  // "chat-link": populated with a markdown web link in lisbon's last reply, so
  // REA can right-click it and open Conductor's link menu (`cEi` -> `EQ`).
  const LISBON_TAIL = "passes (4 tests).";
  const chatLink = { ...populated, conductor: populated.conductor.replace(LISBON_TAIL, `${LISBON_TAIL} See the [session docs](https://docs.example.com/auth/sessions).`) };

  window.__OC_SEED_DATA__ = { populated, "needs-permission": needsPermission, "two-turns": twoTurns, "chat-link": chatLink };
})();
