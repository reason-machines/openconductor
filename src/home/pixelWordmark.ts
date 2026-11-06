// Home's centred pixel wordmark, in the grid of Conductor's own wordmark
// (REA, Conductor v0.87.6: renderApp-D_fmY7hW.js `Xgi` @1,790,111 draws
// conductor-wordmark-{light,dark}.png, 2400x369, in an `h-24` box at most
// 627px wide). Measured from that image: the canvas is 62 units wide; each
// glyph is 6 units wide on a 7-unit pitch; a pixel is 2 units wide and may sit
// on a half-pixel (1-unit) offset; 5 bars per glyph, 1.5 units tall on a
// 2-unit pitch; corners rounded about 0.13 units. The glyphs below are our own
// drawings of OPENCONDUCTOR on that grid; no shape is copied from the image.

/** One glyph: 5 rows of 6 one-unit columns, `#` filled. */
type Glyph = readonly [string, string, string, string, string];

const GLYPHS: Record<string, Glyph> = {
  O: [".####.", "##..##", "##..##", "##..##", ".####."],
  P: ["#####.", "##..##", "#####.", "##....", "##...."],
  E: ["######", "##....", "#####.", "##....", "######"],
  N: ["##..##", "###.##", "##.###", "##..##", "##..##"],
  C: [".#####", "##....", "##....", "##....", ".#####"],
  D: ["#####.", "##..##", "##..##", "##..##", "#####."],
  U: ["##..##", "##..##", "##..##", "##..##", ".####."],
  T: ["######", "..##..", "..##..", "..##..", "..##.."],
  R: ["#####.", "##..##", "#####.", "##.##.", "##..##"],
};

export const GLYPH_WIDTH = 6;
export const GLYPH_PITCH = 7;
export const BAR_HEIGHT = 1.5;
export const ROW_PITCH = 2;
export const CORNER_RADIUS = 0.13;

export interface Bar {
  x: number;
  y: number;
  width: number;
}

export interface PixelWordmark {
  width: number;
  height: number;
  bars: Bar[];
}

/** Bars (merged runs of filled units) for `text`, left to right, top to bottom. */
export function pixelWordmark(text: string): PixelWordmark {
  const bars: Bar[] = [];
  [...text].forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`no pixel glyph for ${JSON.stringify(ch)}`);
    glyph.forEach((row, r) => {
      for (const m of row.matchAll(/#+/g)) {
        bars.push({ x: i * GLYPH_PITCH + (m.index ?? 0), y: r * ROW_PITCH, width: m[0].length });
      }
    });
  });
  const width = text.length === 0 ? 0 : (text.length - 1) * GLYPH_PITCH + GLYPH_WIDTH;
  return { width, height: 4 * ROW_PITCH + BAR_HEIGHT, bars };
}
