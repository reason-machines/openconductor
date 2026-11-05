// Find in terminal, matching the reference's search over the xterm buffer:
// wrapped rows join into one logical line, matching ignores case, and a
// match maps back to the cell where it starts and the cells it spans (wide
// characters count as two). Pure over a minimal view of xterm's buffer API so
// it runs under node tests.

export interface CellLike {
  getWidth(): number;
  getChars(): string;
}
export interface LineLike {
  readonly isWrapped: boolean;
  readonly length: number;
  getCell(x: number): CellLike | undefined;
}
export interface BufferLike {
  readonly length: number;
  getLine(y: number): LineLike | undefined;
}

interface CellSpan {
  column: number;
  lineIndex: number;
  /** Cell offset from the start of the logical line. */
  logicalCellOffset: number;
  textStart: number;
  textEnd: number;
  width: number;
}

export interface SearchableLine {
  text: string;
  cells: CellSpan[];
  nextCellOffset: number;
}

export interface Match {
  /** Buffer row of the first matched cell. */
  lineIndex: number;
  column: number;
  /** Cells to select from (lineIndex, column); may run onto wrapped rows. */
  length: number;
}

/** Logical lines of the buffer: a wrapped row continues the line above it. */
export function searchableLines(buffer: BufferLike): SearchableLine[] {
  const out: SearchableLine[] = [];
  for (let y = 0; y < buffer.length; y += 1) {
    const line = buffer.getLine(y);
    if (!line) continue;
    const prev = out[out.length - 1];
    const target = line.isWrapped && prev ? prev : { text: "", cells: [], nextCellOffset: 0 };
    if (target !== prev) out.push(target);
    const base = target.nextCellOffset;
    for (let x = 0; x < line.length; x += 1) {
      const cell = line.getCell(x);
      if (!cell) continue;
      const width = cell.getWidth();
      // The trailing half of a wide character has width 0.
      if (width <= 0) continue;
      const start = target.text.length;
      target.text += cell.getChars() || " ";
      target.cells.push({ column: x, lineIndex: y, logicalCellOffset: base + x, textStart: start, textEnd: target.text.length, width });
    }
    target.nextCellOffset = base + line.length;
  }
  return out;
}

const cellAt = (cells: CellSpan[], offset: number) => cells.find((c) => offset >= c.textStart && offset < c.textEnd);

/** Case-insensitive, non-overlapping matches in buffer order. */
export function findMatches(lines: SearchableLine[], term: string): Match[] {
  if (term === "") return [];
  const needle = term.toLowerCase();
  const step = Math.max(1, term.length);
  const out: Match[] = [];
  for (const line of lines) {
    const hay = line.text.toLowerCase();
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + step)) {
      const first = cellAt(line.cells, i);
      const last = cellAt(line.cells, i + term.length - 1);
      if (!first || !last) continue;
      out.push({
        lineIndex: first.lineIndex,
        column: first.column,
        length: Math.max(1, last.logicalCellOffset - first.logicalCellOffset + Math.max(1, last.width)),
      });
    }
  }
  return out;
}

/** "2 of 5"; "0 of 0" when nothing matches. */
export const counterText = (count: number, index: number): string => `${count > 0 && index >= 0 ? index + 1 : 0} of ${count}`;

export const nextIndex = (index: number, count: number): number => (count === 0 ? index : (index + 1) % count);
export const previousIndex = (index: number, count: number): number => (count === 0 ? index : (index - 1 + count) % count);

/** Row to scroll to so a match is visible: its row, but never past the last page. */
export const scrollRow = (lineIndex: number, bufferLength: number, rows: number): number =>
  Math.min(lineIndex, Math.max(0, bufferLength - rows));

/** Stable key of a match list; a change means the buffer moved under the search. */
export const matchesKey = (matches: Match[]): string => matches.map((m) => `${m.lineIndex}:${m.column}:${m.length}`).join("|");
