import type { Shortcut } from "../../keybindings/types.ts";
import { matchesEvent, type KeyEventLike } from "../../keybindings/shortcut.ts";
import type { OpenInApp } from "./apps.ts";

export type SwitcherEntry = { kind: "app"; app: OpenInApp } | { kind: "close" };
export interface SwitcherSelection {
  entries: readonly SwitcherEntry[];
  index: number;
  visible: boolean;
}

export const SWITCHER_DELAY_MS = 300;

export function switcherEntries(apps: readonly OpenInApp[], mru: readonly string[], width: number): SwitcherEntry[] {
  const ordered = new Map<string, OpenInApp>();
  for (const saved of mru) {
    const id = saved.replace(/\|(local|remote)$/, "");
    const app = apps.find((a) => a.id === id);
    if (app) ordered.set(id, app);
  }
  for (const app of apps) if (!ordered.has(app.id)) ordered.set(app.id, app);
  const capacity = Math.max(1, Math.floor((width - 80 - 48) / 110));
  return [...Array.from(ordered.values()).slice(0, capacity - 1).map((app): SwitcherEntry => ({ kind: "app", app })), { kind: "close" }];
}

export function cycleSwitcher(selection: SwitcherSelection, direction: 1 | -1): SwitcherSelection {
  return { ...selection, index: (selection.index + direction + selection.entries.length) % selection.entries.length, visible: true };
}

export function releasesOpenShortcut(shortcuts: readonly Shortcut[], event: KeyEventLike): boolean {
  const modifier = event.key === "Meta" ? "meta" : event.key === "Control" ? "ctrl" : event.key === "Alt" ? "alt" : event.key === "Shift" ? "shift" : null;
  return modifier !== null
    ? shortcuts.some((s) => s.modifiers?.includes(modifier))
    : shortcuts.some((s) => !s.modifiers?.length && matchesEvent(s, event));
}
