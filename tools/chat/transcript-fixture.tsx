// Renders <Transcript> with a fixed transcript shaped like Conductor's
// chat--transcript-collapsed-tools / chat--tool-calls-expanded references
// (evidence/screens), so rendering changes can be screenshotted without an agent.
// ?theme=dark|light, ?running=1 keeps the turn running, ?cancelled=1 stops it early, ?tools=expanded opens
// the "N tool calls, M messages" summary, ?files=N gives the turn N changed-file chips in its footer row
// (?more=K clicks "+N more" K times).
import React from "react";
import ReactDOM from "react-dom/client";
import { Transcript } from "../../src/features/chat/Transcript.tsx";
import { TurnChanges } from "../../src/features/chat/TurnChanges.tsx";
import { turnChanges } from "../../src/features/diff/useTurnChanges.ts";
import { applyChatEvents, emptyTranscript } from "../../src/features/chat/reducer.ts";
import type { Block, ChatEvent, ChatMessage } from "../../src/features/chat/types.ts";
import "../../src/fonts.css";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
const running = params.get("running") === "1";
const cancelled = params.get("cancelled") === "1";

const S = "w1";
const T = "w1:t1";
const at = (s: number) => new Date(Date.UTC(2026, 10, 5, 10, 29, 0) + s * 1000).toISOString();
const msg = (id: string, role: ChatMessage["role"], blocks: Block[], s: number): ChatMessage => ({ id, sessionId: S, turnId: T, role, createdAt: at(s), blocks });
const tool = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });
const result = (id: string, content: string): Block => ({ type: "tool_result", toolUseId: id, content });

const assistant: Block[] = [
  { type: "text", text: "I'll look at how the login route decides where to send a signed-in user." },
  tool("g1", "Grep", { pattern: "redirectTo", path: "src" }),
  result("g1", "src/lib/auth.ts:12\nsrc/routes/login.ts:8"),
  tool("r1", "Read", { file_path: "src/lib/auth.ts" }),
  result("r1", "export function redirectTo(session) { ... }"),
  { type: "text", text: "Found it. `redirectTo` treats any session object as signed in, including an expired one, while the dashboard loader rejects expired sessions and sends the user back to `/login`. I'll check `expiresAt` before redirecting." },
  tool("e1", "Edit", { file_path: "src/lib/auth.ts" }),
  result("e1", "ok"),
  tool("b1", "Bash", { command: "pnpm test src/lib/auth.test.ts" }),
  result("b1", "4 passed"),
  {
    type: "text",
    text: "Fixed. Expired sessions now go straight to `/login` instead of looping.\n\n- `src/lib/auth.ts`: only redirect to the dashboard when the session has not expired.\n- Tests: `pnpm test src/lib/auth.test.ts` passes (4 tests).\n\n```ts\nexport function redirectTo(session: Session | null): string {\n  // An expired session is not signed in.\n  if (!session || session.expiresAt <= Date.now()) return \"/login\";\n  return \"/dashboard\";\n}\n```\n\n| File | Change |\n|---|---|\n| `src/lib/auth.ts` | +1 -1 |\n| `src/lib/auth.test.ts` | +14 |\n\nDocs: https://example.com/auth",
  },
];

const events: ChatEvent[] = [
  { type: "upsert", message: { ...msg(`${T}:user`, "user", [{ type: "text", text: "After signing in, users with an expired session get bounced between /login and /dashboard forever. Can you find out why and fix it?" }], 0), ...(cancelled ? { cancelledAt: at(30) } : {}) } },
  { type: "turn_status", sessionId: S, turnId: T, status: "running", at: at(0) },
  { type: "upsert", message: msg(`${T}:assistant`, "assistant", cancelled ? assistant.slice(0, 3) : assistant, 2) },
  ...(running ? [] : [{ type: "turn_status", sessionId: S, turnId: T, status: cancelled ? "cancelled" : "completed", at: at(cancelled ? 31 : 480) } as ChatEvent]),
];
const r = applyChatEvents(emptyTranscript(S), events);
if (!r.ok) throw new Error(JSON.stringify(r.error));

const fileCount = Number(params.get("files") ?? 0);
const paths = ["src/lib/auth.ts", "src/lib/auth.test.ts", "src/routes/login.ts", "src/routes/dashboard.tsx", "src/lib/session.ts", "docs/auth.md", "src/middleware.ts", "CHANGELOG.md"];
const turnRef = (turnId: string) => ({ sessionId: S, turnId });
if (fileCount > 0) {
  turnChanges.record(
    turnRef(T),
    paths.slice(0, fileCount).map((path, i) => ({ path, old_path: null, status: "modified", binary: false, additions: [1, 14, 3, 22, 6, 9, 2, 4][i]!, deletions: [1, 0, 2, 5, 0, 1, 2, 0][i]! })),
  );
}
const turnFooter = fileCount > 0 ? (turnId: string) => <TurnChanges turn={turnRef(turnId)} worktree={null} onOpenFile={() => undefined} /> : undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 28px" }}>
      <Transcript transcript={r.transcript} turnFooter={turnFooter} />
    </main>
  </React.StrictMode>,
);

if (params.get("tools") === "expanded") {
  setTimeout(() => document.querySelector<HTMLButtonElement>('.chat-tool-summary-row[aria-expanded="false"]')?.click(), 100);
}
for (let i = 0; i < Number(params.get("more") ?? 0); i++) {
  setTimeout(() => document.querySelector<HTMLButtonElement>(".chat-turn-chip.more")?.click(), 150 + i * 50);
}
