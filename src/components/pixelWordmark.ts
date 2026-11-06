/**
 * OpenConductor's own pixel wordmark. The glyphs are our bitmap font (5 columns by
 * 7 rows, one blank column between letters), not Conductor's artwork. `buildPixelWordmark`
 * turns a string into the filled cells of one SVG path so the Home screen can draw it
 * in currentColor.
 */

const GLYPHS: Record<string, readonly string[]> = {
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
};

export const PIXEL_GLYPH_ROWS = 7;
export const PIXEL_GLYPH_COLS = 5;

export interface PixelCell {
  readonly col: number;
  readonly row: number;
}

export interface PixelWordmark {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly PixelCell[];
}

/** Lays `text` out left to right. Letters outside the font are an error, not a blank. */
export function buildPixelWordmark(text: string): PixelWordmark {
  const cells: PixelCell[] = [];
  let offset = 0;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`no pixel glyph for "${ch}"`);
    glyph.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "#") cells.push({ col: offset + col, row });
      }
    });
    offset += PIXEL_GLYPH_COLS + 1;
  }
  return { cols: Math.max(0, offset - 1), rows: PIXEL_GLYPH_ROWS, cells };
}

/** SVG path data for the cells: one unit square per cell, with a 1-unit gap between cells. */
export function pixelWordmarkPath(mark: PixelWordmark): string {
  return mark.cells.map(({ col, row }) => `M${col} ${row}h0.82v0.82h-0.82z`).join("");
}
