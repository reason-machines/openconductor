// Renders <Transcript> with Conductor's "lisbon" reference turn (tools/screens/seed-data.js,
// the chat--transcript-collapsed-tools / chat--tool-calls-expanded references in
// evidence/screens) inside a box with the geometry of Conductor's chat column at
// 1440x900 (x 256-1045, y 80 down), so tools/chat/transcript-parity.mjs can
// compare it with the references pixel for pixel without an agent.
//
// ?theme=dark|light, ?tools=expanded opens the "N tool calls, M messages" summary,
// ?running=1 keeps the turn running, ?cancelled=1 stops it early,
// ?agent=claude|codex|reason picks which agent's wire shape the same turn arrives in
// (the rows must look the same for all three).
import React from "react";
import ReactDOM from "react-dom/client";
import { Transcript } from "../../src/features/chat/Transcript.tsx";
import { FileBadge } from "../../src/features/chat/ToolRows.tsx";
import { applyChatEvents, emptyTranscript } from "../../src/features/chat/reducer.ts";
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

const chips = (
  <div className="chat-turn-changes" role="group" aria-label="Files changed in this turn">
    {LISBON.changes.map((f) => (
      <FileBadge key={f.path} path={f.path} className="chat-turn-chip">
        <span className="oc-chip-counts">
          <span className="a">+{f.additions}</span>
          <span className="d">-{f.deletions}</span>
        </span>
      </FileBadge>
    ))}
  </div>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)" }}>
      <section className="chat" style={{ position: "absolute", left: 256, top: 80, width: 789, bottom: 0, display: "flex", flexDirection: "column", border: 0 }}>
        <div className="chat-scroll">
          <Transcript transcript={r.transcript} workspacePath={LISBON.workspacePath} turnFooter={() => chips} onResetChat={() => undefined} now={() => LISBON.startedAt + 3600_000} />
        </div>
      </section>
    </div>
  </React.StrictMode>,
);

if (params.get("tools") === "expanded") {
  setTimeout(() => document.querySelector<HTMLButtonElement>('.chat-tool-summary-row[aria-expanded="false"]')?.click(), 100);
}
