// Shortcut model, matching Conductor's registry (evidence/keybindings/README.md).

/** Modifiers, in the order they are always displayed and compared. */
export const MODIFIERS = ["ctrl", "meta", "shift", "alt"] as const;
export type Modifier = (typeof MODIFIERS)[number];

/** Compared with `KeyboardEvent.key`. */
export interface LogicalKey {
  kind: "logical";
  value: string;
}

/** Compared with `KeyboardEvent.code`; `display` is what the UI shows. */
export interface PhysicalKey {
  kind: "physical";
  code: string;
  display: string;
}

export interface Shortcut {
  key: LogicalKey | PhysicalKey;
  modifiers?: readonly Modifier[];
}

/** When a shortcut may fire (see the dispatcher). */
export interface When {
  isGlobal?: boolean;
  enableOnInputFocus?: boolean;
  allowWhileTyping?: boolean;
  enableOnDialogIds?: readonly string[];
  enableOnTerminalFocus?: boolean;
  requireTerminalFocus?: boolean;
}

export const CATEGORIES = ["General", "View", "Navigation", "Workspace", "Chat", "Code review", "Terminal"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Command {
  id: string;
  key: Shortcut;
  additionalKeys?: readonly Shortcut[];
  title: string;
  category: Category;
  configurable: boolean;
  hidden?: boolean;
  displayScope?: string;
  description?: string;
  when?: When;
}

export const logical = (value: string, modifiers?: readonly Modifier[]): Shortcut =>
  modifiers ? { key: { kind: "logical", value }, modifiers } : { key: { kind: "logical", value } };

export const physical = (code: string, display: string, modifiers?: readonly Modifier[]): Shortcut =>
  modifiers
    ? { key: { kind: "physical", code, display }, modifiers }
    : { key: { kind: "physical", code, display } };
