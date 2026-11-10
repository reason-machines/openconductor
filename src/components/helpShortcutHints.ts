import { glyphs } from "../keybindings/shortcut.ts";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";

export function helpShortcutHints(commandId: string, overrides: Overrides): string[] {
  return effectiveShortcuts(commandId, overrides).map(glyphs);
}
