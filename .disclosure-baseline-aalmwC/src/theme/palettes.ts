// The colour palettes Settings > Appearance offers. Their colours are in
// tokens.css, keyed on `data-color-palette` on <html>; this module only names
// them and sets the attribute.

export const PALETTE_IDS = ["neutral", "stone", "blue", "slate", "zinc"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const DEFAULT_PALETTE: PaletteId = "neutral";

export const PALETTE_LABELS: Record<PaletteId, string> = {
  neutral: "Neutral",
  stone: "Stone",
  blue: "Blue",
  slate: "Slate",
  zinc: "Zinc",
};

/** Whether `value` names a palette Settings can store. */
export const isPaletteId = (value: unknown): value is PaletteId =>
  typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);

/** The palette for a stored value; unknown or missing values are Neutral. */
export const paletteFrom = (value: unknown): PaletteId => (isPaletteId(value) ? value : DEFAULT_PALETTE);

/** Sets the palette on the document root; tokens.css does the rest. */
export function applyPalette(id: PaletteId, root: HTMLElement = document.documentElement): void {
  root.dataset.colorPalette = id;
}
