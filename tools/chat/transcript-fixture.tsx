// Renders <Transcript> with Conductor's "lisbon" reference turn (tools/screens/seed-data.js,
// the chat--transcript-collapsed-tools / chat--tool-calls-expanded references in
// evidence/screens) inside a box with the geometry of Conductor's chat column at
// 1440x900 (x 256-1045, y 80 down), so tools/chat/transcript-parity.mjs can
// compare it with the references pixel for pixel without an agent.
//
// ?theme=dark|light, ?tools=expanded opens the "N tool calls, M messages" summary,
// ?running=1 keeps the turn running, ?cancelled=1 stops it early,
// ?agent=claude|codex|reason picks which agent's wire shape the same turn arrives in
// (the rows must look the same for all three), ?files=N gives the turn N changed-file chips
// instead of the reference's two (?more=K clicks "+N more" K times).
// ?fork=1 opens the turn's More actions menu and, with ?forked=1, picks "Fork to new tab" and
// shows the transcript attachment the new tab would get.
import React from "react";
import ReactDOM from "react-dom/client";
import { Transcript } from "../../src/features/chat/Transcript.tsx";
import { TurnChanges } from "../../src/features/chat/TurnChanges.tsx";
import { turnChanges } from "../../src/features/diff/useTurnChanges.ts";
import { applyChatEvents, emptyTranscript } from "../../src/features/chat/reducer.ts";
import { forkAttachmentName, forkTranscript, turnAgentLabel } from "../../src/features/chat/fork.ts";
import type { Block, ChatEvent, ChatMessage } from "../../src/features/chat/types.ts";
import { LISBON, lisbonBlocks, type FixtureAgent } from "./lisbon.ts";
import "../../src/fonts.css";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
const running = params.get("running") === "1";
const cancelled = params.get("cancelled") === "1";
const agent = (params.get("agent") ?? "claude") as FixtureAgent;

const S = "w1";
const T = "w1:t1";
const at = (s: number) => new Date(LISBON.startedAt + s * 1000).toISOString();
const msg = (id: string, role: ChatMessage["role"], blocks: Block[], s: number): ChatMessage => ({ id, sessionId: S, turnId: T, role, createdAt: at(s), blocks });

const assistant = lisbonBlocks(agent);
const events: ChatEvent[] = [
  { type: "upsert", message: { ...msg(`${T}:user`, "user", [{ type: "text", text: LISBON.prompt }], 0), ...(cancelled ? { cancelledAt: at(30) } : {}) } },
  { type: "turn_status", sessionId: S, turnId: T, status: "running", at: at(0) },
  { type: "upsert", message: msg(`${T}:assistant`, "assistant", cancelled ? assistant.slice(0, 3) : assistant, 2) },
  ...(running ? [] : [{ type: "turn_status", sessionId: S, turnId: T, status: cancelled ? "cancelled" : "completed", at: at(LISBON.durationSeconds) } as ChatEvent]),
];
const r = applyChatEvents(emptyTranscript(S), events);
if (!r.ok) throw new Error(JSON.stringify(r.error));

const paths = ["src/lib/auth.ts", "src/lib/auth.test.ts", "src/routes/login.ts", "src/routes/dashboard.tsx", "src/lib/session.ts", "docs/auth.md", "src/middleware.ts", "CHANGELOG.md"];
const fileCount = Number(params.get("files") ?? 0);
const files =
  fileCount > 0
    ? paths.slice(0, fileCount).map((path, i) => ({ path, additions: [1, 14, 3, 22, 6, 9, 2, 4][i]!, deletions: [1, 0, 2, 5, 0, 1, 2, 0][i]! }))
    : LISBON.changes;
const turnRef = (turnId: string) => ({ sessionId: S, turnId });
turnChanges.record(
  turnRef(T),
  files.map((f) => ({ path: f.path, old_path: null, status: "modified", binary: false, additions: f.additions, deletions: f.deletions })),
);
const turnFooter = (turnId: string) => <TurnChanges turn={turnRef(turnId)} worktree={null} onOpenFile={() => undefined} />;

const fork = params.get("fork") === "1";
function Fixture() {
  const [forked, setForked] = React.useState<string | null>(null);
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", overflow: "auto" }}>
      <section className="chat" style={{ position: "absolute", left: 256, top: 80, width: 789, bottom: 0, display: "flex", flexDirection: "column", border: 0 }}>
        <div className="chat-scroll">
          <Transcript
            transcript={r.transcript}
            workspacePath={LISBON.workspacePath}
            turnFooter={turnFooter}
            turnAgent={turnAgentLabel("byok:anthropic:claude-opus-5-5", "Reason")}
            onResetChat={() => undefined}
            onForkToNewTab={(turnId) => (fork ? setForked(forkTranscript(r.transcript, turnId)) : undefined)}
            onForkToNewWorkspace={(turnId) => (fork ? setForked(forkTranscript(r.transcript, turnId)) : undefined)}
            now={() => LISBON.startedAt + 3600_000}
          />
          {forked !== null ? (
            <section className="fixture-fork" style={{ margin: "24px 28px" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                New tab's composer attachment: {forkAttachmentName(null)}
              </div>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 6 }}>{forked}</pre>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fixture />
  </React.StrictMode>,
);

if (params.get("tools") === "expanded") {
  setTimeout(() => document.querySelector<HTMLButtonElement>('.chat-tool-summary-row[aria-expanded="false"]')?.click(), 100);
}
if (fork) {
  setTimeout(() => document.querySelector<HTMLButtonElement>('.chat-turn-menu button[aria-label="More actions"]')?.click(), 150);
  if (params.get("forked") === "1") setTimeout(() => document.querySelector<HTMLButtonElement>(".chat-menu-item")?.click(), 300);
}
for (let i = 0; i < Number(params.get("more") ?? 0); i++) {
  setTimeout(() => document.querySelector<HTMLButtonElement>(".chat-turn-chip.more")?.click(), 150 + i * 50);
}
