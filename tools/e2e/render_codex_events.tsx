// Renders a `codex-chat-event` log (as written by the live IPC test in
// src-tauri/src/codex_chat.rs) through the app's own Codex mapper
// (src/features/chat/codex.ts) and transcript component, to a static HTML page.
//
// Usage:
//   npx esbuild tools/e2e/render_codex_events.tsx --bundle --platform=node \
//     --outfile=/tmp/render.cjs --loader:.css=empty
//   node /tmp/render.cjs <events.json> <out.html> "<prompt 1>" "<prompt 2>" ...
// The prompts are the user's messages, which the backend does not echo.

import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { applyCodexPayload, codexChat, startTurn, type CodexPayload } from "../../src/features/chat/codex.ts";
import { applyChatEvents, emptyTranscript } from "../../src/features/chat/reducer.ts";
import { Transcript } from "../../src/features/chat/Transcript.tsx";

const [eventsFile, outFile, ...prompts] = process.argv.slice(2);
const events = JSON.parse(readFileSync(eventsFile!, "utf8")) as CodexPayload[];
const chatId = events[0]?.chatId ?? "chat";

let state = codexChat(chatId);
let transcript = emptyTranscript(chatId);
const apply = (step: { state: typeof state; events: Parameters<typeof applyChatEvents>[1] }) => {
  state = step.state;
  const r = applyChatEvents(transcript, step.events);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  transcript = r.transcript;
};

// As in the app: a prompt opens its turn when it is sent (the first before any
// event), and the next one is sent after the previous turn ends.
let next = 0;
const approvals: string[] = [];
if (prompts.length) apply(startTurn(state, prompts[next++]!));
for (const p of events) {
  if (p.type === "approval") approvals.push(p.command ?? p.kind);
  apply(applyCodexPayload(state, p));
  if (p.type === "turnEnded" && next < prompts.length) apply(startTurn(state, prompts[next++]!));
}

const css = ["src/styles.css", "src/features/chat/chat.css"].map((f) => readFileSync(f, "utf8")).join("\n");
const body = renderToStaticMarkup(<Transcript transcript={transcript} expandToolsByDefault />);
const note = approvals.length ? `<p class="muted">Approvals answered Allow during these turns: ${approvals.map((a) => `<code>${a.replace(/</g, "&lt;")}</code>`).join(", ")}</p>` : "";
writeFileSync(
  outFile!,
  `<!doctype html><html><head><meta charset="utf-8"><title>Codex chat transcript</title><style>${css}
body{padding:24px;max-width:860px;margin:0 auto;overflow:auto;height:auto}</style></head>
<body><h3>Codex chat, rendered from the live event log (${events.length} events)</h3>${note}<div class="chat-scroll">${body}</div></body></html>`,
);
console.log(`wrote ${outFile}: ${transcript.messages.length} messages`);
