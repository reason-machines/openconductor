import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { buildResults, cycleTab, emptyText, placeholderFor, TABS, type PaletteData, type PaletteIcon, type PaletteTab, type ResultItem } from "./search/model.ts";
import { COMMAND_PALETTE_DIALOG_ID, moveActive, paletteCommandFor, tabSelectionIndex } from "./state.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { VIEW_ARCHIVED_ACTION } from "./fromAppState.ts";
import type { ArchiveFilter, ArchivedWorkspace } from "../workspace/archivedList.ts";
import type { Repo } from "../state/types.ts";
import type { MoveToSectionProps, SectionItem } from "./MoveToSection.tsx";
import { loadFilters, saveFilters, CLEARED_FILTERS, type HomeFilters, type HomeRow } from "../home/allWorkspaces.ts";
import { showClearFilters, workspacesTabRows } from "./workspacesTab.ts";
import { WorkspaceFilters, WorkspaceRow } from "./WorkspacesTab.tsx";
import { SearchIcon } from "../components/Icons";
import { useDialogMotion } from "../components/motion/dialogMotion";
import { ConductorIcon } from "../components/ConductorIcon";
import type { ConductorIconName } from "../components/conductorIcons.generated";
import { shortRelativeTime as shortTime } from "../home/allWorkspaces";
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
   * When set, the palette replaces its list with the section picker sub-view.
   * `sectionKey` gates the display (a stable key PaletteHost sets when entering section mode).
   * `localWorkspaceId` must equal `data.activeWorkspaceId` for the sub-view to stay visible.
   */
  moveToSection?: MoveToSectionProps;
  sectionKey?: string;
  localWorkspaceId?: string;
  /**
   * "Archived workspaces" filter the Workspaces tab opens with, without saving it;
   * otherwise it opens with the filters saved by Home's All workspaces, which it shares.
   */
  initialArchiveFilter?: ArchiveFilter;
  /** The Workspaces tab's rows: open repositories and conductor.db's archived workspaces. */
  repos?: readonly Repo[];
  archived?: readonly ArchivedWorkspace[];
  onSelect: (item: ResultItem) => void;
  /** A settings result's icon (its page's, as in Settings' own search). */
  settingIcon?: (settingId: string) => ReactNode;
  actionIcon?: (actionId: string) => ReactNode;
  onClose: () => void;
  /**
   * Injected by PaletteHost: the section picker component to render in section sub-view mode.
   * Not imported directly to keep CommandPalette free of a MoveToSection module dependency.
   */
  SectionPicker?: ComponentType<{ workspaceId: string; sections: readonly MoveToSectionProps["sections"][number][]; query: string; active: number; onActive: (index: number) => void; onSelectAt: (index: number) => void; onBack: () => void }>;
  /**
   * Injected by PaletteHost: computes the flat navigable item list for keyboard navigation.
   * Not imported directly to keep CommandPalette free of a MoveToSection module dependency.
   */
  computeSectionItems?: (sections: MoveToSectionProps["sections"], workspaceId: string, query: string) => SectionItem[];
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

/** Lucide names of Conductor's palette icons (`Ln("sun")` and so on, renderApp @10,913,500). */
const ICONS: Record<PaletteIcon, ConductorIconName> = {
  plus: "plus",
  "folder-plus": "folder-plus",
  "sun-moon": "sun",
  "panel-left": "panel-left",
  "panel-right": "panel-right",
  maximize: "maximize-2",
  message: "message-square",
  keyboard: "keyboard",
  book: "book-open",
  "chevron-right": "chevron-right",
  settings: "settings",
  home: "house",
  archive: "archive",
  file: "file-text",
  link: "link",
  search: "search",
  "git-pull-request": "git-pull-request",
  "external-link": "external-link",
  "circle-alert": "circle-alert",
};

/** Every chord bound to an action, as Conductor's `Ss` lists a key and its alternatives ("⌘B or ["). */
function shortcutsFor(item: ResultItem, overrides: Overrides): string[] {
  if (item.kind !== "action") return [];
  if (item.action.hint) return [item.action.hint];
  if (!item.action.bindingId) return [];
  return effectiveShortcuts(item.action.bindingId, overrides).map(glyphs);
}

function Shortcut({ keys }: { keys: string[] }) {
  if (keys.length === 0) return null;
  return (
    <span className="palette-kbd">
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && <span className="palette-kbd-or">or</span>}
          {k}
        </span>
      ))}
    </span>
  );
}

/** Conductor's workspace result row (`SUi`): repo initial, display name, then the last-activity time. */
function ResultWorkspaceRow({ item, showNumber }: { item: Extract<ResultItem, { kind: "workspace" }>; showNumber: boolean }) {
  const w = item.workspace;
  return (
    <>
      <span className="palette-repo-initial" title={w.repoName} aria-hidden>
        {w.repoName.charAt(0).toUpperCase()}
      </span>
      <span className="palette-ws-main">
        {/* Conductor's workspace switcher row (`SUi`): a fixed-width W-<n> column, empty when unnumbered. */}
        {showNumber && <span className="palette-number">{workspaceNumberLabel(w.number)}</span>}
        <span className="palette-title palette-ws-name" data-unread={w.unread || undefined}>
          {w.label ?? w.name}
        </span>
      </span>
      <span className="palette-ws-time">{w.activeAt !== undefined ? shortTime(w.activeAt) : null}</span>
    </>
  );
}

export function CommandPalette({ data, overrides = {}, showProjects = true, initialTab = "all", initialArchiveFilter, repos = [], archived = [], showWorkspaceNumbers = false, onSelect, settingIcon, actionIcon, onClose, moveToSection, sectionKey, localWorkspaceId, SectionPicker, computeSectionItems }: CommandPaletteProps) {
  const [tab, setTab] = useState<PaletteTab>(initialTab);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(initialTab === "workspaces" ? -1 : 0);
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

  /* Section sub-view: visible when sectionKey is set and the workspace hasn't changed. */
  const inSectionMode =
    sectionKey !== undefined &&
    localWorkspaceId !== undefined &&
    localWorkspaceId === data.activeWorkspaceId &&
    moveToSection !== undefined;
  const sectionFlatItems = inSectionMode && moveToSection && computeSectionItems
    ? computeSectionItems(moveToSection.sections, moveToSection.workspaceId, query)
    : [];

  const wsRows = useMemo(() => workspacesTabRows(repos, filters, query, archived), [repos, filters, query, archived]);
  const groups = useMemo(() => (tab === "workspaces" ? [] : buildResults(tab, query, data)), [tab, query, data]);
  const flat = useMemo(
    () => (tab === "workspaces" ? [...wsRows.active, ...wsRows.archived].map(rowItem) : groups.flatMap((g) => g.items)),
    [tab, wsRows, groups],
  );

  function changeTab(next: PaletteTab) {
    if (next === tab) return;
    setActive(tabSelectionIndex({
      from: tab,
      to: next,
      selected: flat[active],
      results: next === "workspaces" ? [] : buildResults(next, query, data).flatMap((group) => group.items),
    }));
    setTab(next);
  }
  const typed = useRef(false);
  useEffect(() => {
    if (typed.current) setActive(0);
    typed.current = true;
  }, [query]);
  useEffect(() => {
    if (tab !== "workspaces") listRef.current?.scrollTo(0, 0);
  }, [tab, query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function chooseSectionAt(i: number) {
    if (!moveToSection) return;
    const item = sectionFlatItems[i];
    if (!item) return;
    if (item.kind === "section") {
      const isCurrent = moveToSection.sections
        .find((s) => s.workspaceIds.includes(moveToSection.workspaceId))?.id === item.section.id;
      if (!isCurrent) moveToSection.onMove(item.section.id);
    } else if (item.kind === "new") {
      moveToSection.onNewSection();
    } else if (item.kind === "remove") {
      moveToSection.onMove(null);
    }
  }

  function choose(item: ResultItem | undefined) {
    if (!item) return;
    // Move to section: enter the section picker sub-view without dismissing.
    if (item.kind === "action" && item.action.id === "move-to-section") {
      setQuery("");
      onSelect(item);
      return;
    }
    // Conductor: switch to the Workspaces tab showing archived ones too, and stay open.
    if (item.kind === "action" && item.action.id === VIEW_ARCHIVED_ACTION) {
      changeTab("workspaces");
      setFiltersState(CLEARED_FILTERS);
      setQuery("");
      return;
    }
    onSelect(item);
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    /* Section sub-view: Backspace on empty query goes back to commands. */
    if (inSectionMode && moveToSection && e.key === "Backspace" && query === "") {
      e.preventDefault();
      e.stopPropagation();
      moveToSection.onBack();
      return;
    }
    const cmd = paletteCommandFor(e.nativeEvent, overrides);
    if (cmd === null) return;
    if ((e.nativeEvent.isComposing || e.keyCode === 229) && cmd !== "close" && cmd !== "next-tab" && cmd !== "prev-tab") return;
    e.preventDefault();
    e.stopPropagation();
    if (inSectionMode && moveToSection) {
      /* In section sub-view: Escape and previousTab go back; Enter selects; arrow keys navigate. */
      if (cmd === "close" || cmd === "prev-tab") {
        moveToSection.onBack();
      } else if (cmd === "select") {
        chooseSectionAt(active);
      } else {
        setActive((a) => moveActive(a, sectionFlatItems.length, cmd));
      }
      return;
    }
    if (cmd === "close") onClose();
    else if (cmd === "select") choose(flat[active]);
    else if (cmd === "next-tab" || cmd === "prev-tab") changeTab(cycleTab(tab, cmd === "next-tab" ? 1 : -1, showProjects));
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
            placeholder={inSectionMode ? "Filter sections…" : placeholderFor(tab)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
        </div>
        {inSectionMode && moveToSection && SectionPicker ? (
          <SectionPicker
            workspaceId={moveToSection.workspaceId}
            sections={moveToSection.sections}
            query={query}
            active={active}
            onActive={setActive}
            onSelectAt={chooseSectionAt}
            onBack={moveToSection.onBack}
          />
        ) : null}
        {!inSectionMode && <div className="palette-tabs">
          <div className="palette-tablist" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={t.value === tab}
                className={t.value === tab ? "palette-tab active" : "palette-tab"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => changeTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "workspaces" && <WorkspaceFilters repos={repos} filters={filters} onChange={setFilters} />}
        </div>}
        {!inSectionMode && <div className="palette-list" id="palette-list" role="listbox" ref={listRef} data-tab={tab}>
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
              {flat.length === 0 && !groups.some((g) => g.emptyText) && <div className="palette-empty">{emptyText(tab)}</div>}
              {groups.map((g) => (
                <div key={g.id} className="palette-group" role="group" aria-label={g.heading}>
                  {g.heading && <div className="palette-heading">{g.heading}</div>}
                  {g.items.length === 0 && g.emptyText && (
                    <div className="palette-item palette-item-empty" role="option" aria-disabled="true" aria-selected="false">
                      <span className="palette-icon" aria-hidden>
                        <ConductorIcon name="search" size={16} />
                      </span>
                      <span className="palette-title">{g.emptyText}</span>
                    </div>
                  )}
                  {g.items.map((item) => {
                    const i = ++index;
                    const archivedRow = item.kind === "workspace" && !!item.workspace.archived;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={i === active}
                        data-archived={archivedRow || undefined}
                        data-kind={item.kind}
                        className={i === active ? "palette-item active" : "palette-item"}
                        onMouseMove={() => i !== active && setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(item)}
                      >
                        {item.kind === "workspace" ? (
                          <ResultWorkspaceRow item={item} showNumber={showWorkspaceNumbers} />
                        ) : item.kind === "project" ? (
                          <>
                            <span className="palette-repo-initial" aria-hidden>{item.project.name.charAt(0).toUpperCase()}</span>
                            <span className="palette-title">{item.project.name}</span>
                          </>
                        ) : item.kind === "action" ? (
                          <>
                            <span className="palette-icon" aria-hidden>
                              {actionIcon?.(item.action.id) ?? (item.action.icon && <ConductorIcon name={ICONS[item.action.icon]} size={16} />)}
                            </span>
                            <span className={item.action.group === "open-in" ? "palette-title palette-open-in-title" : "palette-title"}>{item.action.title}</span>
                            <Shortcut keys={shortcutsFor(item, overrides)} />
                          </>
                        ) : (
                          <>
                            <span className="palette-icon" aria-hidden>{settingIcon?.(item.setting.id)}</span>
                            <span className="palette-title">{item.setting.title}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>}
      </div>
    </div>
  );
}
