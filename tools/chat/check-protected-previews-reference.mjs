// Pass the retained Conductor 0.87.6 index-BGEQ8YjU.js; no app or provider starts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { groupParts } from "../../src/features/chat/toolGroups.ts";

const path = process.argv[2];
assert.ok(path, "Pass the retained index-BGEQ8YjU.js path");
const bytes = readFileSync(path);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(readFileSync(new URL("../../evidence/frontend/tauri-assets-manifest.json", import.meta.url), "utf8"));
assert.equal(sha256, "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3");
assert.equal(manifest.entries.find((entry) => entry.key === "/assets/index-BGEQ8YjU.js")?.sha256, sha256);
const source = bytes.toString("utf8");
const offsets = {};
const functions = ["na", "Fa", "ktt", "die", "Att", "Ett", "hie", "SB", "wB", "btt", "uie", "Ott", "Ftt", "bB", "pie", "Ntt", "_jt"].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("function ", start + 9);
  assert.ok(start >= 0 && end > start, `${name} must exist in the pinned index`);
  offsets[name] = Buffer.byteLength(source.slice(0, start));
  return source.slice(start, end);
});
const context = vm.createContext({});
vm.runInContext(functions.join("\n"), context, { timeout: 1000 });
const text = (value) => ({ type: "text", text: value });
let nextTool = 0;
const tool = (name) => ({ type: "tool_use", id: `t${nextTool++}`, name, input: {} });
const reads = () => Array.from({ length: 3 }, () => [tool("Read")]);
const cases = [];
for (const name of ["ExitPlanMode", "AskUserQuestion"]) {
  cases.push({ name: `${name}: supersedes earlier text`, messages: [[text("Earlier explanation")], [tool("Read")], [tool(name)], [tool("Read")], [tool("Read")]] });
  cases.push({ name: `${name}: whole message and surrounding summaries`, messages: [...reads(), [text("Please review"), tool(name), tool("Read")], ...reads(), [text("Final response")]] });
  cases.push({ name: `${name}: remains protected before later text`, messages: [[tool(name)], [text("Final response")], ...reads()] });
}
cases.push({ name: "both request types", messages: [...reads(), [tool("ExitPlanMode")], ...reads(), [tool("AskUserQuestion")], ...reads()] });
cases.push({ name: "ordinary final text", messages: [...reads(), [text("Final response")]] });
cases.push({ name: "plain-text tool names are not requests", messages: [[text("AskUserQuestion")], ...reads(), [text("Final response")]] });
cases.push({ name: "case-sensitive tool identity", messages: [...reads(), [tool("askuserquestion")], [text("Final response")]] });

for (const c of cases) {
  const userMessage = { id: "user", role: "user", createdAt: 0, content: { type: "user", message: { content: [text("Synthetic prompt")] } } };
  const aiMessages = c.messages.map((content, i) => ({ id: `m${i}`, role: "assistant", createdAt: i + 1, content: { type: "assistant", message: { content } } }));
  context.input = JSON.stringify({ userMessage, aiMessages, subAgentExecutions: [] });
  const reference = JSON.parse(vm.runInContext("JSON.stringify(_jt(JSON.parse(input)))", context, { timeout: 1000 }));
  const expected = reference.filter((item) => item.type !== "message" || item.message.id !== "user").map((item) => item.type === "summary"
    ? { summary: item.collapsedMessages.map(({ message }) => message.id) }
    : { inline: item.message.id, preview: item.isPreviewMessage });
  const parts = c.messages.flatMap((content, i) => content.map((block, j) => ({
    key: `m${i}:${j}`, messageKey: `m${i}`,
    part: block.type === "text" ? { kind: "text", text: block.text, streaming: false }
      : { kind: "tool", call: { id: block.id, name: block.name, input: {}, tool: { name: block.name, input: {} }, status: "done" } },
  })));
  const actual = [];
  for (const item of groupParts(parts, "turn")) {
    if (item.kind === "summary") actual.push({ summary: [...new Set(item.parts.map((part) => part.messageKey))] });
    else {
      const previous = actual.at(-1);
      if (previous?.inline === item.messageKey) previous.preview &&= Boolean(item.preview);
      else actual.push({ inline: item.messageKey, preview: Boolean(item.preview) });
    }
  }
  assert.deepEqual(actual, expected, c.name);
}
console.log(JSON.stringify({ result: "PASS", cases: cases.length, sha256, offsets, limitation: "Pure reachable retained selector and grouping comparison only; no mounted renderer, native app or provider acceptance." }, null, 2));
