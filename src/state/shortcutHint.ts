// Cmd+1..9 hints on sidebar rows, after Conductor's `_ea` / `v6e` / `uea`
// (renderApp chunk, REA-extracted, read as data): holding exactly the
// modifiers of `workspace.switchTo1` for 500 ms shows each of the first nine
// visible rows' number in place of its icon ("Switch with Command-N"); a
// key change, mouse move, click, wheel, blur or focus hides them again.
import { MODIFIERS, type Modifier } from "../keybindings/types.ts";

export const HINT_DELAY_MS = 500;
export const HINT_COUNT = 9;

const FLAG: Record<Modifier, "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> = {
  ctrl: "ctrlKey",
  meta: "metaKey",
  shift: "shiftKey",
  alt: "altKey",
};

export type ModifierState = Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/** The event holds exactly these modifiers, and at least one. */
export function holdsExactly(modifiers: readonly Modifier[], e: ModifierState): boolean {
  return modifiers.length > 0 && MODIFIERS.every((m) => e[FLAG[m]] === modifiers.includes(m));
}

/** Hint number (1..9) for each of the first nine ids, in order. */
export function hintNumbers(ids: readonly string[]): Map<string, number> {
  return new Map(ids.slice(0, HINT_COUNT).map((id, i) => [id, i + 1]));
}

/** "Switch with Command-3": Conductor's label for the hint. */
export function hintLabel(n: number): string {
  return `Switch with Command-${n}`;
}
