// Stored chat rows (persist.ts `full_message` JSON) for the resize-reflow check:
// Conductor's "lisbon" turn (tools/chat/lisbon.ts, invented data) three times,
// so the message list runs under the composer.
//
//   node tools/side-by-side/resize-reflow-rows.mjs <chatId>   prints the rows as JSON
import { fileURLToPath } from "node:url";
import { LISBON, lisbonBlocks } from "../chat/lisbon.ts";

export function lisbonRows(chatId) {
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const turnId = `${chatId}:t${i}`;
    const start = LISBON.startedAt + i * 600_000;
    const at = (s) => new Date(start + s * 1000).toISOString();
    const turn = { status: "completed", startedAt: at(0), endedAt: at(LISBON.durationSeconds) };
    rows.push(JSON.stringify({ id: `${turnId}:user`, sessionId: chatId, turnId, role: "user", createdAt: at(0), blocks: [{ type: "text", text: LISBON.prompt }], turn }));
    rows.push(JSON.stringify({ id: `${turnId}:assistant`, sessionId: chatId, turnId, role: "assistant", createdAt: at(2), blocks: lisbonBlocks("claude") }));
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(lisbonRows(process.argv[2] ?? "__CHAT__")));
