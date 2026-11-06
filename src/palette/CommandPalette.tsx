import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { buildResults, cycleTab, emptyText, placeholderFor, TABS, type PaletteData, type PaletteIcon, type PaletteTab, type ResultItem } from "./search/model.ts";
import { COMMAND_PALETTE_DIALOG_ID, moveActive, paletteCommandFor } from "./state.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { VIEW_ARCHIVED_ACTION } from "./fromAppState.ts";
import { ARCHIVE_FILTERS, ARCHIVE_FILTER_LABEL, ARCHIVE_FILTER_TEXT, UNARCHIVE_LABEL, type ArchiveFilter } from "../workspace/archivedList.ts";
import { ArchiveIcon } from "../components/Icons";
import { ConductorIcon } from "../components/ConductorIcon";
import type { ConductorIconName } from "../components/conductorIcons.generated";
import { shortRelativeTime } from "../home/allWorkspaces";
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
  /** Initial "Archived workspaces" filter of the Workspaces tab. */
  initialArchiveFilter?: ArchiveFilter;
  onSelect: (item: ResultItem) => void;
  /** A settings result's icon (its page's, as in Settings' own search). */
  settingIcon?: (settingId: string) => ReactNode;
  /** The button on an archived workspace's row. */
  onUnarchive?: (workspaceId: string) => void;
  onClose: () => void;
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
function WorkspaceRow({ item, showNumber }: { item: Extract<ResultItem, { kind: "workspace" }>; showNumber: boolean }) {
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
      <span className="palette-ws-time">{w.activeAt !== undefined ? shortRelativeTime(w.activeAt) : null}</span>
    </>
  );
}

export function CommandPalette({ data, overrides = {}, showProjects = true, initialTab = "all", initialArchiveFilter = "active", showWorkspaceNumbers = false, onSelect, settingIcon, onUnarchive, onClose }: CommandPaletteProps) {
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
      {/* Conductor's `qZ` command dialog (renderApp @2,915,549): the search field, then the tab row, then the list. */}
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-dialog-id={COMMAND_PALETTE_DIALOG_ID}>
        <div className="palette-input-row">
          <span className="palette-input-icon" aria-hidden>
            <ConductorIcon name="search" size={16} />
          </span>
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
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
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
                const archived = item.kind === "workspace" && !!item.workspace.archived;
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={i === active}
                    data-archived={archived || undefined}
                    data-kind={item.kind}
                    className={i === active ? "palette-item active" : "palette-item"}
                    onMouseMove={() => i !== active && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    {item.kind === "workspace" ? (
                      <WorkspaceRow item={item} showNumber={showWorkspaceNumbers} />
                    ) : item.kind === "project" ? (
                      <>
                        <span className="palette-repo-initial" aria-hidden>{item.project.name.charAt(0).toUpperCase()}</span>
                        <span className="palette-title">{item.project.name}</span>
                      </>
                    ) : item.kind === "action" ? (
                      <>
                        <span className="palette-icon" aria-hidden>
                          {item.action.icon && <ConductorIcon name={ICONS[item.action.icon]} size={16} />}
                        </span>
                        <span className="palette-title">{item.action.title}</span>
                        <Shortcut keys={shortcutsFor(item, overrides)} />
                      </>
                    ) : (
                      <>
                        <span className="palette-icon" aria-hidden>{settingIcon?.(item.setting.id)}</span>
                        <span className="palette-title">{item.setting.title}</span>
                      </>
                    )}
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
