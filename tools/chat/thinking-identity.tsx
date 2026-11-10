import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Transcript } from "../../src/features/chat/Transcript";
import { applyChatEvents, emptyTranscript } from "../../src/features/chat/reducer";
import type { Block, ChatEvent, ChatMessage } from "../../src/features/chat/types";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";

const textA = "I should inspect the current implementation carefully. First independent reasoning.";
const textB = "I should inspect the current implementation carefully. Second independent reasoning.";
const sessionId = "thinking-identity";
const finalText = "The two checks are complete.";
const root = createRoot(document.getElementById("root")!);
let generation = 0;
let transcript = emptyTranscript(sessionId);
let dontCollapse = true;
const thinking = (text: string): Block => ({ type: "thinking", text });
const text = (value: string): Block => ({ type: "text", text: value });
function message(id: string, turnId: string, blocks: Block[], role: ChatMessage["role"] = "assistant"): ChatEvent {
  return { type: "upsert", message: { id, sessionId, turnId, blocks, role, createdAt: "2026-11-07T12:00:00Z" } };
}
function status(turnId: string, value: "running" | "completed"): ChatEvent {
  return { type: "turn_status", sessionId, turnId, status: value };
}
function apply(events: ChatEvent[]) {
  const result = applyChatEvents(transcript, events);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  transcript = result.transcript;
}
function render() {
  flushSync(() => root.render(<main style={{ maxWidth: 840, margin: "48px auto", padding: 24 }}>
    <nav style={{ display: "flex", gap: 16, marginBottom: 32 }}>
      <strong>Thinking expansion regression</strong>
      <button onClick={() => runRegression()}>Run regression</button>
      <button onClick={() => resetSharedPrefix()}>Reset shared prefix</button>
    </nav>
    <Transcript key={generation} transcript={transcript} dontCollapseToolCalls={dontCollapse} now={() => Date.parse("2026-11-07T12:01:00Z")} />
    <pre id="regression-result" style={{ whiteSpace: "pre-wrap", marginTop: 32 }} />
  </main>));
}
function reset(events: ChatEvent[]) {
  generation++;
  dontCollapse = true;
  transcript = emptyTranscript(sessionId);
  apply(events);
  render();
}
function turn(turnId: string, assistants: Block[][]): ChatEvent[] {
  return [message(`${turnId}-user`, turnId, [text("Compare two independent reasoning blocks.")], "user"), status(turnId, "running"),
    ...assistants.map((blocks, i) => message(`${turnId}-assistant-${i}`, turnId, blocks)), status(turnId, "completed")];
}
function resetSharedPrefix() {
  reset(turn("first", [[thinking(textA)], [thinking(textB), text(finalText)]]));
}
const heads = () => [...document.querySelectorAll<HTMLElement>(".chat-thinking .oc-tool-head")];
const expanded = () => heads().map((node) => node.getAttribute("aria-expanded") === "true");
function click(node: HTMLElement | undefined) {
  if (!node) throw new Error("Missing expected control");
  flushSync(() => node.click());
}
function expect(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export function runRegression() {
  const checks: { name: string; passed: boolean; error?: string }[] = [];
  const check = (name: string, run: () => void) => {
    try { run(); checks.push({ name, passed: true }); }
    catch (error) { checks.push({ name, passed: false, error: String(error) }); }
  };
  check("shared prefix in distinct messages", () => {
    resetSharedPrefix();
    expect(expanded(), [false, false], "initial");
    click(heads()[0]);
    expect(expanded(), [true, false], "first click");
    expect(document.querySelector(".chat-text")?.textContent, finalText, "ordinary final text");
    click(heads()[1]);
    expect(expanded(), [true, true], "independent second click");
    click(heads()[0]);
    expect(expanded(), [false, true], "independent close");
  });
  check("exact same text across turns", () => {
    reset([...turn("first", [[thinking(textA), text(finalText)]]), ...turn("second", [[thinking(textA), text(finalText)]])]);
    click(heads()[0]);
    expect(expanded(), [true, false], "separate turns");
  });
  check("different blocks within one message", () => {
    reset(turn("first", [[thinking(textA), thinking(textB), text(finalText)]]));
    click(heads()[0]);
    expect(expanded(), [true, false], "separate block positions");
  });
  check("open choice survives streaming append and completion", () => {
    reset(turn("first", [[thinking("Short")]]));
    click(heads()[0]);
    apply([status("first", "running"), { type: "text_delta", sessionId, messageId: "first-assistant-0", blockIndex: 0, delta: " reasoning that grows beyond thirty-two characters." }]);
    render();
    expect(expanded(), [true], "streaming is open");
    apply([status("first", "completed")]);
    render();
    expect(expanded(), [true], "retained explicit open after completion");
    click(heads()[0]);
    expect(expanded(), [false], "can close appended block");
    apply([status("first", "running"), { type: "text_delta", sessionId, messageId: "first-assistant-0", blockIndex: 0, delta: " More." }]);
    render();
    expect(expanded(), [true], "streaming temporarily opens closed block");
    apply([status("first", "completed")]);
    render();
    expect(expanded(), [false], "retained explicit closed after completion");
  });
  check("choice survives ungrouped to grouped and summary unmount", () => {
    reset(turn("first", [[thinking(textA), thinking(textB), text(finalText)]]));
    click(heads()[0]);
    apply([message("first-assistant-0", "first", [thinking(textA), thinking(textB), thinking("Third independent block"), text(finalText)])]);
    render();
    expect(expanded(), [true, false, false], "group threshold");
    dontCollapse = false;
    render();
    expect(heads().length, 0, "summary collapsed");
    click(document.querySelector<HTMLElement>(".chat-tool-summary-row") ?? undefined);
    expect(expanded(), [true, false, false], "summary reopened");
    dontCollapse = true;
    render();
    expect(expanded(), [true, false, false], "setting restored");
    apply([message("first-assistant-0", "first", [thinking(textA), thinking(textB), text(finalText)])]);
    render();
    expect(expanded(), [true, false], "ungrouped again");
    click(heads()[0]);
    expect(expanded(), [false, false], "close after regrouping");
    click(heads()[0]);
    expect(expanded(), [true, false], "reopen after regrouping");
  });
  check("ordinary tool expansion does not toggle thinking", () => {
    reset(turn("first", [[thinking(textA), { type: "tool_use", id: "tool-one", name: "Bash", input: { command: "pwd" } }, text(finalText)]]));
    click(heads()[0]);
    const tool = document.querySelector<HTMLElement>(".chat-tool .oc-tool-head");
    const before = tool?.getAttribute("aria-expanded");
    click(tool ?? undefined);
    expect(tool?.getAttribute("aria-expanded") === before, false, "tool toggled");
    expect(expanded(), [true], "thinking unaffected");
    expect(document.querySelector(".chat-text")?.textContent, finalText, "text unaffected");
  });
  resetSharedPrefix();
  click(heads()[0]);
  const report = { theme: document.documentElement.dataset.theme, passed: checks.every((check) => check.passed), checks };
  document.getElementById("regression-result")!.textContent = JSON.stringify(report, null, 2);
  return report;
}
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") ?? "dark";
resetSharedPrefix();
