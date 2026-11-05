// Pure palette interaction logic: which keys move, select, close or switch
// tabs, and how the active row moves. Kept out of the component so it runs
// under `node --test`.

import type { FocusContext } from "../keybindings/dispatcher.ts";
import type { Overrides } from "../keybindings/overrides.ts";
import { resolveCommand } from "../keybindings/resolve.ts";
import type { KeyEventLike } from "../keybindings/shortcut.ts";

export const COMMAND_PALETTE_DIALOG_ID = "command-palette-dialog";

export type PaletteCommand = "next-item" | "prev-item" | "first-item" | "last-item" | "select" | "close" | "next-tab" | "prev-tab";

const PALETTE_FOCUS: FocusContext = { activeDialogId: COMMAND_PALETTE_DIALOG_ID, typing: true, inTerminal: false };
const PALETTE_COMMANDS = ["commandPalette.nextTab", "commandPalette.previousTab", "toggleCommandPalette"];

/** Map a keydown inside the palette input to a palette command, or null to let it type. */
export function paletteCommandFor(e: KeyEventLike, overrides: Overrides = {}): PaletteCommand | null {
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
  if (plain && !e.shiftKey) {
    if (e.key === "ArrowDown") return "next-item";
    if (e.key === "ArrowUp") return "prev-item";
    if (e.key === "Enter") return "select";
    if (e.key === "Escape") return "close";
  }
  if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (e.key === "ArrowUp") return "first-item";
    if (e.key === "ArrowDown") return "last-item";
  }
  // Ctrl+N / Ctrl+P move like the arrows (macOS text-field convention).
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (e.key === "n") return "next-item";
    if (e.key === "p") return "prev-item";
  }
  switch (resolveCommand(e, PALETTE_FOCUS, PALETTE_COMMANDS, { overrides })) {
    case "commandPalette.nextTab":
      return "next-tab";
    case "commandPalette.previousTab":
      return "prev-tab";
    case "toggleCommandPalette":
      return "close";
    default:
      return null;
  }
}

/** New active index after a movement command; the list wraps around. */
export function moveActive(active: number, count: number, cmd: PaletteCommand): number {
  if (count === 0) return 0;
  switch (cmd) {
    case "next-item":
      return (active + 1) % count;
    case "prev-item":
      return (active - 1 + count) % count;
    case "first-item":
      return 0;
    case "last-item":
      return count - 1;
    default:
      return Math.min(active, count - 1);
  }
}
