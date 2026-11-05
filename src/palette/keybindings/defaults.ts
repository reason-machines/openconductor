// OpenConductor's default bindings for the shell, palette and navigation.
// Ids, default keys, categories and `when` scopes follow the reference
// registry recorded in evidence/search-palette/keybindings.json.

import { chord, type Chord } from "./chord.ts";
import type { BindingDef, Category, When } from "./routing.ts";

export const COMMAND_PALETTE_DIALOG_ID = "command-palette-dialog";

const GLOBAL: When = { isGlobal: true };
const IN_PALETTE: When = { enableOnDialogIds: [COMMAND_PALETTE_DIALOG_ID], allowWhileTyping: true };

function def(
  id: string,
  title: string,
  category: Category,
  keys: Chord[],
  opts: { when?: When; configurable?: boolean; hidden?: boolean } = {},
): BindingDef {
  return { id, title, category, keys, configurable: opts.configurable ?? true, hidden: opts.hidden, when: opts.when };
}

const switchTo: BindingDef[] = Array.from({ length: 9 }, (_, i) =>
  def(`workspace.switchTo${i + 1}`, `Switch to workspace ${i + 1}`, "Workspace", [chord(String(i + 1), "meta")]),
);

export const DEFAULT_BINDINGS: readonly BindingDef[] = [
  def("toggleCommandPalette", "Command palette", "General", [chord("k", "meta")], { when: GLOBAL }),
  def("commandPalette.nextTab", "Next tab (Command palette)", "General", [chord("Tab")], { when: IN_PALETTE, hidden: true }),
  def("commandPalette.previousTab", "Previous tab (Command palette)", "General", [chord("Tab", "shift")], {
    when: IN_PALETTE,
    hidden: true,
  }),
  def("toggleTheme", "Toggle theme (dark/light)", "General", [], { when: GLOBAL }),
  def("openKeyboardShortcuts", "Keyboard shortcuts", "General", [], { when: GLOBAL }),
  def("openSettings", "Settings", "General", [chord(",", "meta")], { when: GLOBAL, configurable: false }),
  def("view.toggleLeftSidebar", "Toggle left sidebar", "View", [chord("b", "meta"), chord("[")]),
  def("view.toggleRightSidebar", "Toggle right sidebar", "View", [chord("]")]),
  def("view.toggleZenMode", "Toggle zen mode", "View", [chord(".", "meta")], { when: GLOBAL }),
  def("nav.back", "Navigate back", "Navigation", [chord("[", "meta")], { when: GLOBAL }),
  def("nav.forward", "Navigate forward", "Navigation", [chord("]", "meta")], { when: GLOBAL }),
  def("nav.home", "Go to Home", "Navigation", [chord("h", "meta", "shift")], { when: GLOBAL }),
  def("nav.quickOpen", "Quick open file", "Navigation", [chord("p", "meta")], { when: GLOBAL }),
  def("nav.searchInFiles", "Search in files", "Navigation", [chord("f", "meta", "shift")], { when: GLOBAL }),
  def("workspace.create", "Create new workspace", "Workspace", [chord("n", "meta")]),
  def("workspace.archive", "Archive workspace", "Workspace", [chord("a", "meta", "shift")], { when: GLOBAL }),
  ...switchTo,
  def("workspace.previous", "Previous workspace", "Workspace", [chord("ArrowUp", "meta", "alt")]),
  def("workspace.next", "Next workspace", "Workspace", [chord("ArrowDown", "meta", "alt")]),
  def("terminal.clearScrollback", "Clear terminal scrollback", "Terminal", [chord("k", "meta")], {
    when: { requireTerminalFocus: true },
    configurable: false,
    hidden: true,
  }),
];
