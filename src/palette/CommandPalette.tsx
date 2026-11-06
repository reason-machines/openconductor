import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { buildResults, cycleTab, emptyText, placeholderFor, TABS, type PaletteData, type PaletteTab, type ResultItem } from "./search/model.ts";
import { COMMAND_PALETTE_DIALOG_ID, moveActive, paletteCommandFor } from "./state.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { VIEW_ARCHIVED_ACTION } from "./fromAppState.ts";
import type { ArchiveFilter, ArchivedWorkspace } from "../workspace/archivedList.ts";
import type { Repo } from "../state/types.ts";
import { loadFilters, saveFilters, CLEARED_FILTERS, type HomeFilters, type HomeRow } from "../home/allWorkspaces.ts";
import { showClearFilters, workspacesTabRows } from "./workspacesTab.ts";
import { WorkspaceFilters, WorkspaceRow } from "./WorkspacesTab.tsx";
import { SearchIcon } from "../components/Icons";
import { useDialogMotion } from "../components/motion/dialogMotion";
import "./palette.css";

export interface CommandPaletteProps {
  data: PaletteData;
  overrides?: Overrides;
  /** Projects tab is hidden for team organisations. */
  showProjects?: boolean;
  initialTab?: PaletteTab;
  /** Experimental "Show workspace numbers": W-<n> before each workspace's name. */
  showWorkspaceNumbers?: boolean;
  /**
   * "Archived workspaces" filter the Workspaces tab opens with, without saving it;
   * otherwise it opens with the filters saved by Home's All workspaces, which it shares.
   */
  initialArchiveFilter?: ArchiveFilter;
  /** The Workspaces tab's rows: open repositories and conductor.db's archived workspaces. */
  repos?: readonly Repo[];
  archived?: readonly ArchivedWorkspace[];
  onSelect: (item: ResultItem) => void;
  onClose: () => void;
}

/** A Workspaces-tab row as the palette item it selects. */
function rowItem(row: HomeRow): ResultItem {
  const w = row.workspace;
  return {
    kind: "workspace",
    id: `workspace:${w.id}`,
    workspace: { id: w.id, name: row.title, branch: w.branch, repoName: row.repo.name, lastActiveAt: row.lastActiveAt, archived: row.archived, number: w.number ?? null },
  };
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

export function CommandPalette({ data, overrides = {}, showProjects = true, initialTab = "all", initialArchiveFilter, repos = [], archived = [], showWorkspaceNumbers = false, onSelect, onClose }: CommandPaletteProps) {
  const [tab, setTab] = useState<PaletteTab>(initialTab);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [filters, setFiltersState] = useState<HomeFilters>(() => {
    const saved = loadFilters(new Set(repos.map((r) => r.id)));
    return initialArchiveFilter ? { ...saved, archiveFilter: initialArchiveFilter } : saved;
  });
  const setFilters = (f: HomeFilters) => {
    setFiltersState(f);
    saveFilters(f);
  };
  const listRef = useRef<HTMLDivElement>(null);
  const motionRef = useDialogMotion<HTMLDivElement>();
  const now = Date.now();

  const wsRows = useMemo(() => workspacesTabRows(repos, filters, query, archived), [repos, filters, query, archived]);
  const groups = useMemo(() => (tab === "workspaces" ? [] : buildResults(tab, query, data)), [tab, query, data]);
  const flat = useMemo(
    () => (tab === "workspaces" ? [...wsRows.active, ...wsRows.archived].map(rowItem) : groups.flatMap((g) => g.items)),
    [tab, wsRows, groups],
  );

  // Conductor (cmdk): the Workspaces tab opens with no row highlighted; typing highlights the first.
  useEffect(() => setActive(tab === "workspaces" ? -1 : 0), [tab]);
  const typed = useRef(false);
  useEffect(() => {
    if (typed.current) setActive(0);
    typed.current = true;
  }, [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: ResultItem | undefined) {
    if (!item) return;
    // Conductor: switch to the Workspaces tab showing archived ones too, and stay open.
    if (item.kind === "action" && item.action.id === VIEW_ARCHIVED_ACTION) {
      setTab("workspaces");
      setFiltersState({ ...filters, archiveFilter: "all" });
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
  const wsRow = (row: HomeRow, i: number) => (
    <WorkspaceRow key={row.workspace.id} row={row} active={i === active} showNumber={showWorkspaceNumbers} now={now} onHover={() => setActive(i)} onChoose={() => choose(flat[i])} />
  );
  let index = -1;
  return (
    <div className="palette-backdrop" ref={motionRef} data-dialog-motion="cmdk" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-dialog-id={COMMAND_PALETTE_DIALOG_ID}>
        {/* Conductor's cmdk dialog: the search field first, then the tab row (`CUi`). */}
        <div className="palette-search">
          <SearchIcon size={16} />
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
        </div>
        <div className="palette-tabs">
          <div className="palette-tablist" role="tablist">
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
          {tab === "workspaces" && <WorkspaceFilters repos={repos} filters={filters} onChange={setFilters} />}
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {tab === "workspaces" ? (
            flat.length === 0 ? (
              <div className="palette-ws-empty">
                <span>No matching workspaces</span>
                {showClearFilters(filters) && (
                  <button type="button" className="palette-ws-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => setFilters(CLEARED_FILTERS)}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {wsRows.active.length > 0 && (
                  <div className="palette-group" role="group" aria-label="Workspaces">
                    <div className="palette-heading">Workspaces</div>
                    {wsRows.active.map((row, i) => wsRow(row, i))}
                  </div>
                )}
                {wsRows.archived.length > 0 && (
                  <div className="palette-group" role="group" aria-label="Archived">
                    <div className="palette-heading">Archived</div>
                    {wsRows.archived.map((row, i) => wsRow(row, wsRows.active.length + i))}
                  </div>
                )}
              </>
            )
          ) : (
            <>
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
                        {/* Conductor's workspace switcher row (`SUi`): a fixed-width W-<n> column, empty when unnumbered. */}
                        {showWorkspaceNumbers && item.kind === "workspace" && (
                          <span className="palette-number">{workspaceNumberLabel(item.workspace.number)}</span>
                        )}
                        <span className="palette-title">{title}</span>
                        {detail && <span className="palette-detail">{detail}</span>}
                        {shortcut && <kbd className="palette-kbd">{shortcut}</kbd>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
