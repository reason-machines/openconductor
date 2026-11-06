export function mentionHighlights(text: string, indices: readonly number[], offset = 0): { text: string; matched: boolean }[] {
  const runs: { text: string; matched: boolean }[] = [];
  for (const char of text) {
    const matched = indices.some((index) => index >= offset && index < offset + char.length);
    const last = runs.at(-1);
    if (last?.matched === matched) last.text += char;
    else runs.push({ text: char, matched });
    offset += char.length;
  }
  return runs;
}

export interface FileMentionQuery {
  start: number;
  end: number;
  query: string;
}

/** A whitespace-delimited @ token at a collapsed caret, not an email address. */
export function fileMentionQuery(draft: string, start: number, end = start): FileMentionQuery | null {
  if (start !== end || start < 0 || start > draft.length) return null;
  const before = draft.slice(0, start);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return null;
  const query = match[1] ?? "";
  const from = start - query.length - 1;
  const suffix = /^[^\s@]*/.exec(draft.slice(start))?.[0] ?? "";
  return { start: from, end: start + suffix.length, query };
}

/** Text completion only. The runtime receives a workspace-relative path, not file contents. */
export function insertFileMention(draft: string, range: FileMentionQuery, path: string): { text: string; caret: number } {
  const mention = /\s/.test(path) ? `@${JSON.stringify(path)}` : `@${path}`;
  const tail = draft.slice(range.end);
  const insert = mention + (tail.startsWith(" ") ? "" : " ");
  const text = draft.slice(0, range.start) + insert + tail;
  return { text, caret: range.start + mention.length + 1 };
}
