import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { buildResults, cycleTab, emptyText, placeholderFor, TABS, type PaletteData, type PaletteTab, type ResultItem } from "./search/model.ts";
import { COMMAND_PALETTE_DIALOG_ID, moveActive, paletteCommandFor } from "./state.ts";
import { VIEW_ARCHIVED_ACTION } from "./fromAppState.ts";
import { ARCHIVE_FILTERS, ARCHIVE_FILTER_LABEL, ARCHIVE_FILTER_TEXT, UNARCHIVE_LABEL, type ArchiveFilter } from "../workspace/archivedList.ts";
import { ArchiveIcon } from "../components/Icons";
import { useDialogMotion } from "../components/motion/dialogMotion";
import "./palette.css";

export interface CommandPaletteProps {
  data: PaletteData;
  overrides?: Overrides;
  /** Projects tab is hidden for team organisations. */
  showProjects?: boolean;
  initialTab?: PaletteTab;
  /** Initial "Archived workspaces" filter of the Workspaces tab. */
  initialArchiveFilter?: ArchiveFilter;
  onSelect: (item: ResultItem) => void;
  /** The button on an archived workspace's row. */
  onUnarchive?: (workspaceId: string) => void;
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

function shortcutFor(item: ResultItem, overrides: Overrides): string | null {
  if (item.kind !== "action" || !item.action.bindingId) return null;
  const key = effectiveShortcuts(item.action.bindingId, overrides)[0];
  return key ? glyphs(key) : null;
}

export function CommandPalette({ data, overrides = {}, showProjects = true, initialTab = "all", initialArchiveFilter = "active", onSelect, onUnarchive, onClose }: CommandPaletteProps) {
  const [tab, setTab] = useState<PaletteTab>(initialTab);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>(initialArchiveFilter);
  const listRef = useRef<HTMLDivElement>(null);
  const motionRef = useDialogMotion<HTMLDivElement>();

  const groups = useMemo(() => buildResults(tab, query, data, archiveFilter), [tab, query, data, archiveFilter]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [tab, query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: ResultItem | undefined) {
    if (!item) return;
    // Conductor: switch to the Workspaces tab showing archived ones too, and stay open.
    if (item.kind === "action" && item.action.id === VIEW_ARCHIVED_ACTION) {
      setTab("workspaces");
      setArchiveFilter("all");
      setQuery("");
      return;
    }
    onSelect(item);
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const cmd = paletteCommandFor(e.nativeEvent, overrides);
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
    <div className="palette-backdrop" ref={motionRef} data-dialog-motion="cmdk" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
          {tab === "workspaces" && (
            <label className="palette-archive-filter">
              <ArchiveIcon size={14} />
              <select aria-label={ARCHIVE_FILTER_LABEL} value={archiveFilter} onChange={(e) => setArchiveFilter(e.target.value as ArchiveFilter)}>
                {ARCHIVE_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {ARCHIVE_FILTER_TEXT[f]}
                  </option>
                ))}
              </select>
            </label>
          )}
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
                const shortcut = shortcutFor(item, overrides);
                const archived = item.kind === "workspace" && !!item.workspace.archived;
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={i === active}
                    data-archived={archived || undefined}
                    className={i === active ? "palette-item active" : "palette-item"}
                    onMouseMove={() => i !== active && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <span className="palette-title">{title}</span>
                    {detail && <span className="palette-detail">{detail}</span>}
                    {shortcut && <kbd className="palette-kbd">{shortcut}</kbd>}
                    {archived && onUnarchive && item.kind === "workspace" && (
                      <button
                        type="button"
                        className="palette-unarchive"
                        aria-label={UNARCHIVE_LABEL}
                        title={UNARCHIVE_LABEL}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnarchive(item.workspace.id);
                          onClose();
                        }}
                      >
                        <ArchiveIcon size={14} />
                      </button>
                    )}
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
