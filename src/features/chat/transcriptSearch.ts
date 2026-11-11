import type { ChatTranscript } from "./reducer.ts";
import { messageOrigin } from "./types.ts";

export interface TranscriptMatch {
  turnId: string;
  messageId: string;
  textOffset: number;
  occurrenceInTurn: number;
}

export function transcriptMatches(transcript: ChatTranscript, query: string): TranscriptMatch[] {
  if (!query.trim()) return [];
  const needle = query.toLowerCase();
  const turns = new Map<string, typeof transcript.messages>();
  for (const message of transcript.messages) {
    if (message.sessionId !== transcript.sessionId) continue;
    const origin = messageOrigin(message).kind;
    if (origin !== "user" && origin !== "assistant") continue;
    const messages = turns.get(message.turnId) ?? [];
    messages.push(message);
    turns.set(message.turnId, messages);
  }
  const matches: TranscriptMatch[] = [];
  for (const [turnId, messages] of turns) {
    let occurrenceInTurn = 0;
    const ordered = [...messages.filter((m) => m.role === "user"), ...messages.filter((m) => m.role === "assistant")];
    for (const message of ordered) {
      const text = message.blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").toLowerCase();
      let offset = text.indexOf(needle);
      while (offset !== -1) {
        matches.push({ turnId, messageId: message.id, textOffset: offset, occurrenceInTurn: occurrenceInTurn++ });
        offset = text.indexOf(needle, offset + query.length);
      }
    }
  }
  return matches;
}

export function highlightTranscript(root: HTMLElement, query: string, selected: TranscriptMatch | undefined): () => void {
  if (!query.trim()) return () => {};
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4, {
    acceptNode: (node) => node.parentElement?.closest('.oc-msg-user .oc-user-text, .oc-msg-assistant .oc-text-wrap') && node.textContent?.trim() ? 1 : 2,
  });
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === 3) nodes.push(node as Text);
    node = walker.nextNode();
  }
  const undo: (() => void)[] = [];
  const byTurn = new Map<string, number>();
  for (const text of nodes) {
    const raw = text.data;
    const lower = raw.toLowerCase();
    const needle = query.toLowerCase();
    const parent = text.parentNode;
    const turn = text.parentElement?.closest<HTMLElement>(".oc-turn[data-turn-id]");
    if (!parent || !turn) continue;
    const turnId = turn.dataset.turnId ?? "";
    const fragment = doc.createDocumentFragment();
    let offset = lower.indexOf(needle);
    if (offset === -1) continue;
    const prefix = raw.slice(0, offset);
    let cursor = offset;
    while (offset !== -1) {
      if (offset > cursor) fragment.append(doc.createTextNode(raw.slice(cursor, offset)));
      const mark = doc.createElement("mark");
      mark.dataset.searchHighlight = "true";
      const occurrence = byTurn.get(turnId) ?? 0;
      byTurn.set(turnId, occurrence + 1);
      if (selected?.turnId === turnId && selected.occurrenceInTurn === occurrence) mark.dataset.searchCurrent = "true";
      mark.textContent = raw.slice(offset, offset + query.length);
      fragment.append(mark);
      cursor = offset + query.length;
      offset = lower.indexOf(needle, cursor);
    }
    if (cursor < raw.length) fragment.append(doc.createTextNode(raw.slice(cursor)));
    const inserted = [...fragment.childNodes];
    // Keep React's original text node attached so later reconciliation can update or remove it.
    text.data = prefix;
    parent.insertBefore(fragment, text.nextSibling);
    undo.push(() => {
      for (const added of inserted) added.parentNode?.removeChild(added);
      if (text.parentNode === parent && text.data === prefix) text.data = raw;
    });
  }
  return () => { for (const restore of undo) restore(); };
}
