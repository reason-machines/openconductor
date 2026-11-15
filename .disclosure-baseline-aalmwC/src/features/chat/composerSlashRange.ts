export interface ComposerSlashRange {
  start: number;
  end: number;
  query: string;
}

export function composerSlashRange(text: string, caret: number, selectionEnd: number): ComposerSlashRange | null {
  if (caret !== selectionEnd || caret < 1) return null;
  const before = text.slice(0, caret);
  const textStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\ufffc")) + 1;
  const start = before.lastIndexOf("/");
  if (start < textStart || (start > textStart && before[start - 1] !== " ")) return null;
  const query = before.slice(start + 1);
  return /\s/.test(query) ? null : { start, end: caret, query };
}
