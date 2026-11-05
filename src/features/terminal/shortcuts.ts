// Shortcuts that act on the focused terminal. xterm sees a key before the
// window does, so the terminal resolves these itself (as the reference's
// TERMINAL-priority handlers do) and keeps the key away from the shell.
import { resolveCommand } from "../../keybindings/resolve.ts";
import type { FocusContext } from "../../keybindings/dispatcher.ts";
import type { KeyEventLike } from "../../keybindings/shortcut.ts";

/** Line-editing shortcuts become the bytes a readline/zle shell binds to the same motion. */
export const LINE_EDIT_BYTES: Readonly<Record<string, string>> = {
  "terminal.moveLineStart": "\x01", // Ctrl-A
  "terminal.moveLineEnd": "\x05", // Ctrl-E
  "terminal.deleteLine": "\x15", // Ctrl-U
  "terminal.moveWordLeft": "\x1bb", // Esc b
  "terminal.moveWordRight": "\x1bf", // Esc f
  "terminal.insertNewline": "\x1b\r", // Esc Enter: a literal newline in zsh and agent CLIs
};

export const TAB_COMMANDS = ["terminal.newTab", "terminal.newBigTab", "terminal.closeTab", "terminal.clearScrollback"] as const;

const COMMANDS: readonly string[] = [...TAB_COMMANDS, ...Object.keys(LINE_EDIT_BYTES)];
const IN_TERMINAL: FocusContext = { activeDialogId: null, typing: false, inTerminal: true };

/** The terminal command a key press inside a terminal runs, if any. */
export function terminalCommandFor(e: KeyEventLike): string | undefined {
  return resolveCommand(e, IN_TERMINAL, COMMANDS);
}
