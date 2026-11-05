import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { formatChord } from "./keybindings/chord.ts";
import type { BindingDef } from "./keybindings/routing.ts";
import { COMMAND_PALETTE_DIALOG_ID } from "./keybindings/defaults.ts";
import { buildResults, cycleTab, emptyText, placeholderFor, TABS, type PaletteData, type PaletteTab, type ResultItem } from "./search/model.ts";
import { moveActive, paletteCommandFor } from "./state.ts";
import "./palette.css";

export interface CommandPaletteProps {
  data: PaletteData;
  bindings: readonly BindingDef[];
  /** Projects tab is hidden for team organisations. */
  showProjects?: boolean;
  initialTab?: PaletteTab;
  onSelect: (item: ResultItem) => void;
  onClose: () => void;
}

function itemLabel(item: ResultItem): { title: string; detail?: string } {
  switch (item.kind) {
    case "workspace":
      return { title: item.workspace.name, detail: `${item.workspace.repoName} · ${item.workspace.branch}` };
    case "project":
      return { title: item.project.name };
    case "action":
      return { title: item.action.title };
    case "setting":
      return { title: item.setting.title, detail: item.setting.section };
  }
}

function shortcutFor(item: ResultItem, bindings: readonly BindingDef[]): string | null {
  if (item.kind !== "action" || !item.action.bindingId) return null;
  const key = bindings.find((b) => b.id === item.action.bindingId)?.keys[0];
  return key ? formatChord(key) : null;
}

export function CommandPalette({ data, bindings, showProjects = true, initialTab = "all", onSelect, onClose }: CommandPaletteProps) {
  const [tab, setTab] = useState<PaletteTab>(initialTab);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => buildResults(tab, query, data), [tab, query, data]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [tab, query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: ResultItem | undefined) {
    if (!item) return;
    onSelect(item);
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const cmd = paletteCommandFor(e.nativeEvent, bindings);
    if (cmd === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (cmd === "close") onClose();
    else if (cmd === "select") choose(flat[active]);
    else if (cmd === "next-tab" || cmd === "prev-tab") setTab((t) => cycleTab(t, cmd === "next-tab" ? 1 : -1, showProjects));
    else setActive((a) => moveActive(a, flat.length, cmd));
  }

  const tabs = TABS.filter((t) => t.value !== "projects" || showProjects);
  let index = -1;
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-dialog-id={COMMAND_PALETTE_DIALOG_ID}>
        <div className="palette-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={t.value === tab}
              className={t.value === tab ? "palette-tab active" : "palette-tab"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="palette-input"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholderFor(tab)}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
        />
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {flat.length === 0 && <div className="palette-empty">{emptyText(tab)}</div>}
          {groups.map((g) => (
            <div key={g.id} className="palette-group" role="group" aria-label={g.heading}>
              <div className="palette-heading">{g.heading}</div>
              {g.items.map((item) => {
                const i = ++index;
                const { title, detail } = itemLabel(item);
                const shortcut = shortcutFor(item, bindings);
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? "palette-item active" : "palette-item"}
                    onMouseMove={() => i !== active && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <span className="palette-title">{title}</span>
                    {detail && <span className="palette-detail">{detail}</span>}
                    {shortcut && <kbd className="palette-kbd">{shortcut}</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
