import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConductorToolRow } from "../../../src/features/chat/ToolRows";
import { applyReasonPayload, reasonChat, startTurn } from "../../../src/features/chat/reason";
import { applyChatEvents, emptyTranscript } from "../../../src/features/chat/reducer";
import { buildRows } from "../../../src/features/chat/view";
import "../../../src/fonts.css";
import "../../../src/theme/tokens.css";
import "../../../src/styles.css";
import "../../../src/features/chat/chat.css";

const samples = [
  { id: "glob", name: "Glob", input: { pattern: "**/*.ts" }, output: "\n  /repo/a.ts  \n\t\n/repo/b.ts\n" },
  { id: "space", name: "Glob", input: { pattern: "**/*.ts" }, output: "  /repo/my file.ts  \n/repo/no-space.ts" },
  { id: "ls", name: "LS", input: { path: "src" }, output: "\n  /repo/a.ts  \n\n/repo/b.ts\n" },
];
function Sample({ sample }: { sample: typeof samples[number] }) {
  const [open, setOpen] = useState(false);
  const at = new Date(0);
  const started = startTurn(reasonChat(sample.id), "Inspect files", at);
  const step = applyReasonPayload(started.state, { chatId: sample.id, type: "tool", id: sample.id, title: sample.name, kind: "search", toolName: sample.name, rawInput: sample.input, status: "completed", output: sample.output, diffs: [], locations: [] }, at);
  const reduced = applyChatEvents(emptyTranscript(sample.id), [...started.events, ...step.events]);
  if (!reduced.ok) throw new Error("Fixture reducer failed");
  const row = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  if (row?.kind !== "assistant") throw new Error("Missing assistant row");
  const part = row.parts.find((part) => part.kind === "tool");
  if (part?.kind !== "tool") throw new Error("Missing tool call");
  const call = part.call;
  return <section id={sample.id} style={{ marginBottom: 28 }}><h2 style={{ fontSize: 13, marginBottom: 10 }}>{sample.id === "glob" ? "Padded paths and blank lines" : sample.id === "space" ? "Path with spaces retained" : "LS control retains raw whitespace"}</h2><ConductorToolRow tool={call.tool} status={call.status} result={call.result} isError={false} open={open} onToggle={() => setOpen((value) => !value)} /></section>;
}
function App() {
  return <main className="transcript" style={{ maxWidth: 760, margin: "40px auto", padding: 24 }}><h1 style={{ fontSize: 20, marginBottom: 10 }}>Glob successful-result lines</h1><p style={{ color: "var(--muted)", marginBottom: 28 }}>Production adapter, view and row. Synthetic results. No provider or native execution.</p>{samples.map((sample) => <Sample key={sample.id} sample={sample} />)}</main>;
}
createRoot(document.getElementById("root")!).render(<App />);
