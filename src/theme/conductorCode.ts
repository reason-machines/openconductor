// Conductor's own code-theme palettes, "Conductor Dark" (`QXr`) and "Conductor
// Light" (`YXr`), read from its renderApp chunk (REA, 0.87.6): HSL colour steps
// (`Mr`) turned into hex by its `Zg`. The diff tab registers them as Shiki
// themes (src/features/diff/conductorCodeTheme.ts).

/** Conductor's colour steps (`Mr`) these themes use, as "h s% l%". */
const HSL = {
  accent: { 200: "25 38% 86%", 300: "22 39% 78%", 700: "4 12% 46%", 800: "360 13% 31%" },
  gray: { 0: "30 0% 100%", 100: "30 8% 91%", 300: "20 6% 72%", 400: "23 5% 63%", 500: "22 4% 54%", 900: "25 8% 16%", 1000: "24 10% 7%" },
  green: { 50: "138 76% 97%", 400: "142 69% 58%", 700: "142 72% 29%", 950: "144 48% 15%" },
  orange: { 50: "33 100% 96%", 400: "27 96% 61%", 600: "20 90% 48%", 950: "12 68% 26%" },
  red: { 50: "0 86% 97%", 300: "0 94% 82%", 400: "0 91% 71%", 600: "0 72% 51%", 700: "0 74% 60%", 950: "0 60% 26%" },
  blue: { 400: "213 94% 68%", 600: "221 83% 53%" },
  fuchsia: { 400: "292 100% 66%", 600: "292 100% 46%" },
} as const;

/** Conductor's `Zg`: "h s% l%" to #rrggbb. */
export function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.split(" ").map((c, i) => parseInt(i === 0 ? c : c.replace("%", ""), 10));
  const r = l / 100;
  const o = (s * Math.min(r, 1 - r)) / 100;
  const ch = (c: number) => {
    const u = (c + h / 30) % 12;
    const d = r - o * Math.max(Math.min(u - 3, 9 - u, 1), -1);
    return Math.round(255 * d)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

export interface ConductorPalette {
  fg: string;
  bg: string;
  comment: string;
  keyword: string;
  string: string;
  constant: string;
  entity: string;
  variable: string;
  variableOther: string;
  tag: string;
  invalid: string;
  error: string;
  bracket: string;
  regex: string;
  operator: string;
  class: string;
  markup: { heading: string; quote: string; deleted: string; deletedBg: string; inserted: string; insertedBg: string; changed: string; changedBg: string };
}

const c = hslToHex;

/** `QXr`. */
export const CONDUCTOR_DARK: ConductorPalette = {
  fg: c(HSL.gray[100]),
  bg: c(HSL.gray[1000]),
  comment: c(HSL.gray[500]),
  keyword: c(HSL.red[400]),
  string: c(HSL.accent[300]),
  constant: c(HSL.blue[400]),
  entity: c(HSL.fuchsia[400]),
  variable: c(HSL.orange[400]),
  variableOther: c(HSL.gray[100]),
  tag: c(HSL.green[400]),
  invalid: c(HSL.red[300]),
  error: c(HSL.red[400]),
  bracket: c(HSL.gray[300]),
  regex: c(HSL.accent[200]),
  operator: c(HSL.red[400]),
  class: c(HSL.orange[400]),
  markup: {
    heading: c(HSL.blue[400]),
    quote: c(HSL.green[400]),
    deleted: c(HSL.red[400]),
    deletedBg: c(HSL.red[950]),
    inserted: c(HSL.green[400]),
    insertedBg: c(HSL.green[950]),
    changed: c(HSL.orange[400]),
    changedBg: c(HSL.orange[950]),
  },
};

/** `YXr`. */
export const CONDUCTOR_LIGHT: ConductorPalette = {
  fg: c(HSL.gray[900]),
  bg: c(HSL.gray[0]),
  comment: c(HSL.gray[400]),
  keyword: c(HSL.red[600]),
  string: c(HSL.accent[800]),
  constant: c(HSL.blue[600]),
  entity: c(HSL.fuchsia[600]),
  variable: c(HSL.orange[600]),
  variableOther: c(HSL.gray[900]),
  tag: c(HSL.green[700]),
  invalid: c(HSL.red[700]),
  error: c(HSL.red[600]),
  bracket: c(HSL.gray[500]),
  regex: c(HSL.accent[700]),
  operator: c(HSL.red[600]),
  class: c(HSL.orange[600]),
  markup: {
    heading: c(HSL.blue[600]),
    quote: c(HSL.green[700]),
    deleted: c(HSL.red[600]),
    deletedBg: c(HSL.red[50]),
    inserted: c(HSL.green[700]),
    insertedBg: c(HSL.green[50]),
    changed: c(HSL.orange[600]),
    changedBg: c(HSL.orange[50]),
  },
};
