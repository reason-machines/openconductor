import React from "react";
import ReactDOM from "react-dom/client";
import { Transcript } from "../../src/features/chat/Transcript.tsx";
import { applyReasonPayload, reasonChat, startTurn, type ReasonPayload } from "../../src/features/chat/reason.ts";
import { applyChatEvents, emptyTranscript } from "../../src/features/chat/reducer.ts";
import { diffForSave, restoreEvents } from "../../src/features/chat/persist.ts";
import wire from "../../evidence/chat/usage/claude-wire.json";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
const chatId = "usage-chat";
let state = reasonChat(chatId);
let transcript = emptyTranscript(chatId);
const started = new Date("2026-11-05T10:29:00Z");
const ended = new Date("2026-11-05T10:37:00Z");
function apply(step: ReturnType<typeof startTurn>) {
  state = step.state;
  const result = applyChatEvents(transcript, step.events);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  transcript = result.transcript;
}
function payload(p: ReasonPayload) { apply(applyReasonPayload(state, p, ended)); }
function turn(id: string, usage?: ReasonPayload) {
  apply(startTurn(state, "Show the completed work.", started, id));
  payload({ chatId, type: "thought", text: "Checking the changed files." });
  payload({ chatId, type: "text", text: "The change is complete and verified." });
  if (usage) {
    payload(usage);
    payload(usage);
  }
  payload({ chatId, type: "text", text: " Ready for review." });
  if (!params.has("streaming")) payload({ chatId, type: "turnEnded", end: { outcome: "completed" } });
}
const mode = params.get("case");
const usage: ReasonPayload | undefined = mode === "unknown" ? undefined
  : { chatId, type: "usage", usage: mode === "zero" ? { inputTokens: 0, outputTokens: 0 }
    : mode === "partial" ? { outputTokens: 2400 }
    : wire[0]!.usage! };
turn("first", usage);
if (params.has("multiple")) turn("second");
if (params.has("replay")) {
  const rows = diffForSave(null, transcript).upserts.map((m) => m.fullMessage);
  const events = restoreEvents(chatId, rows);
  const restored = applyChatEvents(emptyTranscript(chatId), [...events, ...events]);
  if (!restored.ok) throw new Error(JSON.stringify(restored.error));
  transcript = restored.transcript;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="chat" style={{ position: "fixed", left: 256, top: 80, width: 789, bottom: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div className="chat-scroll"><Transcript transcript={transcript} turnAgent="Claude Code" now={() => ended.getTime()} /></div>
    </main>
  </React.StrictMode>,
);
