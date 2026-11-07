import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { AppState } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import type { AppInfo } from "../backend";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronIcon, FolderPlusIcon, HomeIcon, LayoutGridIcon, MoreIcon, PlayIcon, PlusIcon, SearchIcon, SettingsIcon, SidebarIcon } from "./Icons";
import { COMMANDS } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";
import { HelpMenu } from "./HelpMenu";
import { PRICING_URL } from "./helpMenuItems";
import { openUrl } from "../backend";
import { RepoIcon } from "./RepoIcon";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import { hasHiddenRepos, moveRepo, visibleRepos } from "../state/repoOrder";
import { SidebarWorkspaceRow, useWorkspaceRows, type RowCallbacks } from "./SidebarWorkspaceRow";
import { RepoWorkspaceList } from "./PendingWorkspaceRow";
import { SidebarGroup } from "./SidebarSections";
import { SidebarStatusGroups } from "./SidebarStatusGroups";
import { isRepoCollapsed, pinnedEntries, repoGroupWorkspaces, sectionEntries, type SidebarSection } from "../state/sidebarOrder";
import { newId } from "../state/names";
import { SectionDialog, type SectionDialogMode } from "./SectionDialog";
import { useSidebarDrag, type WorkspaceRef } from "./useSidebarDrag";
import { DROP_ATTR, reorderIndicator, reorderToIndex, workspaceDropAction, type DropTarget } from "../state/navigationSections";
import { ProjectFilterSubmenu, SidebarRadioSubmenu } from "./home/ProjectFilterSubmenu";
import { SIDEBAR_SORT_OPTIONS } from "../home/sidebarSort";
import { SIDEBAR_GROUP_OPTIONS } from "../home/sidebarGroupBy";
import { setAppPref } from "../settings/appPrefs";
import { useRepoFilter } from "../home/useRepoFilter";
import { useDashboardEnabled } from "../home/useDashboardEnabled";
import { filterRepoGroups } from "../home/repoFilter";
import { SidebarAddRepositoryMenu } from "./AddRepositoryMenu";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { AccountMenu } from "./AccountMenu";
import { ResourceUsagePill } from "./ResourceUsagePill";
import { Tooltip, titleWithShortcut } from "./Tooltip";
import { ContextMenu, MenuItem as CtxItem, MenuSeparator } from "./menu/ContextMenu";
import { useRoutinesAvailable } from "../features/routines/useRoutinesAvailable";
import { EyeIcon, EyeOffIcon, Link2Icon, PencilIcon, PlusIcon as MenuPlusIcon, SettingsIcon as MenuSettingsIcon, Trash2Icon } from "./menu/menuIcons";
import type { WorkspaceRef as UsageWorkspace } from "./resourceUsage";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { endingProps, SidebarPresence, SidebarRowMotion, SidebarSectionMotion, useMenuPresence } from "./sidebarMotion";
import { SidebarActionsMenu, type SidebarMenuAction } from "./SidebarActionsMenu";

/** Window event that opens the sidebar's add-project popover (the palette's "Add project"). */
export const OPEN_ADD_PROJECT_MENU = "openconductor:open-add-project-menu";

/** Default shortcut glyphs for a registered command, e.g. "⌘N" for workspace.create. */
function hint(commandId: string): string {
  const c = COMMANDS.find((cmd) => cmd.id === commandId);
  return c ? glyphs(c.key) : "";
}

export interface NavControls {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onOpenDialog: (d: DialogKind, repoId?: string, sectionId?: string) => void;
  onOpenProject: () => void;
  /** A Recents row of the add-repository menu: add that folder as Open project would. */
  onAddProjectAt?: (path: string) => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  /** Help › Submit a prompt and Help › Diagnostics. */
  onSubmitPrompt: () => void;
  onOpenDiagnostics: () => void;
  onSearch: () => void;
  nav: NavControls;
  info: AppInfo | null;
  /* sidebar: workspace row menu callbacks (rename dialog, archive flow) */
  onRenameWorkspace?: RowCallbacks["onRename"];
  onArchiveWorkspace?: RowCallbacks["onArchive"];
  onCopyWorkspaceLink?: RowCallbacks["onCopyLink"];
  /** Shows an error toast (icon upload failures). */
  onError?: (message: string) => void;
  /** Repo menu "Create from...": the Create dialog with its PR / branch / issue picker open. */
  onCreateFrom?: (repoId: string) => void;
  /** Repo menu "Configuration": the repository's settings, Misc section. */
  onOpenRepoSettings?: (repoId: string) => void;
  /** Repo menu "Remove repository"; the item is hidden until something handles it. */
  onRemoveRepository?: (repoId: string) => void;
}

// Conductor's nav rows: only Home has a native title (`HH("Home","nav.home")`, "Home ⌘…");
// Create and Search have none. All three show the shortcut in the row on hover.
function NavRow({ icon, label, shortcut, title, active, onClick }: { icon: JSX.Element; label: string; shortcut: string; title?: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sb-row" data-active={active ? "true" : undefined} title={title} onClick={onClick}>
      <span className="sb-row-icon">{icon}</span>
      <span className="sb-row-label">{label}</span>
      {shortcut && <kbd className="sb-row-hint">{shortcut}</kbd>}
    </button>
  );
}

interface MenuItem extends SidebarMenuAction { contextShortcut?: string }
/** A custom entry, such as a submenu, rendered with the menu's close function. */
interface MenuNode { key: string; render: (close: () => void) => ReactNode }
/** A menu entry, a custom node, or "-" for a separator line. */
type MenuEntry = MenuItem | MenuNode | "-";

/** Menu panel of the hover "..." trigger. */
function MenuPanel({ items, close, ending = false }: { items: MenuEntry[]; close: () => void; ending?: boolean }) {
  return (
    <div className="sb-menu" role="menu" {...endingProps(ending)}>
      {items.map((item, i) =>
        item === "-" ? (
          <div key={`sep-${i}`} role="separator" className="sb-menu-sep" />
        ) : "render" in item ? (
          <div key={item.key} role="none">{item.render(close)}</div>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="sb-menu-item"
            data-destructive={item.destructive || undefined}
            onClick={() => { close(); item.onSelect(); }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd className="sb-menu-hint">{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/** Close on outside mousedown or Escape while `open`. */
function useDismiss(open: boolean, ref: RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onEvent = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onEvent);
    document.addEventListener("keydown", onEvent);
    return () => {
      document.removeEventListener("mousedown", onEvent);
      document.removeEventListener("keydown", onEvent);
    };
  }, [open, ref, close]);
}

/**
 * Hover "..." trigger and its menu on a section or repo header (Conductor's `Aet`).
 * `contextOpen` keeps the trigger shown while the header's right-click menu is open
 * (`group-has-[[data-popup-open]]/section-header:opacity-100`).
 */
function HeaderMenu(props: { label: string; items: MenuEntry[]; className: string; contextOpen?: boolean }) {
  if (props.items.some((item) => item !== "-" && "render" in item)) return <CustomHeaderMenu {...props} />;
  const items = props.items.filter((item): item is MenuItem | "-" => item === "-" || !("render" in item));
  return <SidebarActionsMenu {...props} items={items} />;
}

function CustomHeaderMenu({ label, items, className, contextOpen }: { label: string; items: MenuEntry[]; className: string; contextOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  // The panel stays mounted for Conductor's 100ms close (data-[ending-style], `my`).
  const dropdown = useMenuPresence(open);
  return (
    <div ref={ref} className={`sb-menu-anchor ${className}`} data-open={open || contextOpen || undefined}>
      <button type="button" className="sb-menu-trigger" aria-label={`${label} actions`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <MoreIcon size={14} />
      </button>
      {dropdown.mounted && <MenuPanel items={items} close={close} ending={dropdown.ending} />}
    </div>
  );
}

type Point = { x: number; y: number };

/** The right-click version of a header's items (Conductor's `menuType: "context"`), at the pointer. */
function HeaderContextMenu({ label, items, at, onClose }: { label: string; items: MenuEntry[]; at: Point; onClose: () => void }) {
  return (
    <ContextMenu at={at} onClose={onClose} label={`${label} actions`}>
      {items.map((item, i) =>
        item === "-" ? (
          <MenuSeparator key={`sep-${i}`} />
        ) : "render" in item ? null : (
          <CtxItem key={item.label} icon={item.icon} shortcut={item.contextShortcut} destructive={item.destructive} disabled={item.disabled} onSelect={item.onSelect}>
            {item.label}
          </CtxItem>
        ),
      )}
    </ContextMenu>
  );
}

/**
 * One user section (Conductor's `Yia`): header with emoji, name, a count while
 * collapsed and the hover chevron; its "..." / right-click menu (`oBi`); the
 * section's rows, or "Drag a workspace here" when it has none.
 */
function NavSectionGroup({ group, collapsed, onToggle, menuItems, renderRow, isDropTarget, isDragging, indicator, isFirst, onHeaderPointerDown }: {
  group: SidebarSection;
  collapsed: boolean;
  onToggle: () => void;
  menuItems: MenuEntry[];
  renderRow: (entry: SidebarSection["entries"][number], listIndex: number) => JSX.Element;
  /* Drag and drop (useSidebarDrag.tsx, Conductor's `Yia`): */
  /** A dragged row is over this section (`Dea`): accent fill. */
  isDropTarget: boolean;
  /** This section is being dragged (`Aea`): half opacity. */
  isDragging: boolean;
  /** Reorder line above this section, or below the last one (`Iea`). */
  indicator: "above" | "below" | undefined;
  isFirst: boolean;
  /** Pressing the header may start a section reorder (`Cea`). */
  onHeaderPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
}) {
  const { section, entries } = group;
  const [contextAt, setContextAt] = useState<Point | null>(null);
  const closeContext = useCallback(() => setContextAt(null), []);
  return (
    <SidebarSectionMotion className="sb-nav-section" data-navigation-section-drop-id={section.id} data-drop-target={isDropTarget || undefined} data-dragging={isDragging || undefined}>
      {indicator && <div className="sb-nav-section-indicator" data-position={indicator} data-first={isFirst || undefined} aria-hidden />}
      <div className="sb-section-header" onContextMenu={(e) => { e.preventDefault(); setContextAt({ x: e.clientX, y: e.clientY }); }}>
        <button type="button" className="sb-section-toggle" aria-expanded={!collapsed} onClick={onToggle} onPointerDown={onHeaderPointerDown}>
          {section.emoji !== undefined && <span className="sb-section-emoji" aria-hidden>{section.emoji}</span>}
          <span className="sb-section-label">{section.name}</span>
          {collapsed && <span className="sb-group-count">{entries.length}</span>}
          <span className="sb-section-spacer" aria-hidden />
          <span className="sb-section-chevron" data-collapsed={collapsed || undefined}>
            {collapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}
          </span>
        </button>
        <HeaderMenu label={section.name} className="sb-section-menu" items={menuItems} contextOpen={!!contextAt} />
        {contextAt && <HeaderContextMenu label={section.name} items={menuItems} at={contextAt} onClose={closeContext} />}
      </div>
      {!collapsed && (
        <div className="sb-ws-list sb-group-list">
          <SidebarPresence>{entries.map((entry, index) => renderRow(entry, index))}</SidebarPresence>
          {entries.length === 0 && (
            <div className="sb-section-empty">
              <PlusIcon size={14} />
              <span>Drag a workspace here</span>
            </div>
          )}
        </div>
      )}
    </SidebarSectionMotion>
  );
}

export function Sidebar({ state, dispatch, onOpenDialog, onOpenProject, onAddProjectAt, onOpenSettings, onOpenShortcuts, onSubmitPrompt, onOpenDiagnostics, onSearch, nav, info, onRenameWorkspace, onArchiveWorkspace, onCopyWorkspaceLink, onError, onCreateFrom, onOpenRepoSettings, onRemoveRepository }: Props) {
  // Row menu > Rename opens the Rename workspace dialog unless the host handles it.
  const [renaming, setRenaming] = useState<{ repoId: string; workspaceId: string } | null>(null);
  const openRename = useCallback<NonNullable<RowCallbacks["onRename"]>>((repoId, ws) => setRenaming({ repoId, workspaceId: ws.id }), []);
  const renamingWs = renaming && state.repos.find((r) => r.id === renaming.repoId)?.workspaces.find((w) => w.id === renaming.workspaceId);
  // Conductor keeps each section's collapse under `section-<id>`; ours lasts for the session.
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set());
  const [sectionDialog, setSectionDialog] = useState<SectionDialogMode | null>(null);
  // Drag rows onto a section, Pinned or My workspaces, and section headers to reorder (Conductor's `esa`).
  const scrollRoot = useRef<HTMLElement>(null);
  const onDropWorkspace = (ws: WorkspaceRef, target: DropTarget) => {
    const action = workspaceDropAction(state.sections ?? [], ws.id, ws.pinned, target);
    if (action?.kind === "assign") dispatch({ type: "assignSection", workspaceId: ws.id, sectionId: action.sectionId });
    else if (action?.kind === "unassign") dispatch({ type: "assignSection", workspaceId: ws.id, sectionId: null });
    else if (action) dispatch({ type: "setWorkspacePinned", repoId: ws.repoId, workspaceId: ws.id, pinned: action.kind === "pin" });
  };
  const onDropSection = (sectionId: string, target: DropTarget) => {
    const toIndex = reorderToIndex(state.sections ?? [], sectionId, target);
    if (toIndex !== undefined) dispatch({ type: "reorderSection", sectionId, toIndex });
  };
  const drag = useSidebarDrag({ sections: state.sections ?? [], enabled: true, scrollRoot, onDropWorkspace, onDropSection });
  const dropTarget = drag.dragging?.target;
  const rows = useWorkspaceRows(state, dispatch, {
    onRename: onRenameWorkspace ?? openRename,
    onArchive: onArchiveWorkspace,
    onCopyLink: onCopyWorkspaceLink,
    onNewSection: (ws) => setSectionDialog({ mode: "create", workspaceIdToMove: ws.id }),
    collapsedSections,
    onRowPointerDown: (e, repoId, ws) => drag.workspacePointerDown(e, { repoId, id: ws.id, pinned: typeof ws.pinnedAt === "number" }),
  });
  const { sections, sectioned } = sectionEntries(state);
  const pinned = pinnedEntries(state, sectioned);
  const toggleSection = (id: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const submitSection = (mode: SectionDialogMode, value: { name: string; emoji?: string }) => {
    if (mode.mode === "edit") {
      dispatch({ type: "editSection", sectionId: mode.sectionId, ...value });
      return;
    }
    const section = { id: newId(), ...value, workspaceIds: mode.workspaceIdToMove === undefined ? [] : [mode.workspaceIdToMove] };
    // Conductor's create (`_Y`) takes the workspace out of any other section; it does not unpin it.
    dispatch({ type: "createSection", section, beforeSectionId: mode.beforeSectionId });
  };
  const sectionMenu = (sectionId: string): MenuEntry[] => {
    const s = state.sections?.find((x) => x.id === sectionId);
    // Conductor's section menu (`oBi` @10004433, right-click via `Qia`): Create workspace (plus),
    // Edit section (pencil), New section… (plus), separator, Delete section (trash-2, destructive).
    return [
      { label: "Create workspace", icon: <MenuPlusIcon />, onSelect: () => onOpenDialog("create", undefined, sectionId) },
      { label: "Edit section", icon: <PencilIcon />, onSelect: () => s && setSectionDialog({ mode: "edit", sectionId, name: s.name, emoji: s.emoji }) },
      { label: "New section…", icon: <MenuPlusIcon />, onSelect: () => setSectionDialog({ mode: "create", beforeSectionId: sectionId }) },
      "-",
      { label: "Delete section", icon: <Trash2Icon />, destructive: true, onSelect: () => dispatch({ type: "deleteSection", sectionId }) },
    ];
  };
  const row = ({ repoId, workspace }: SidebarSection["entries"][number], listIndex: number, showRepo = false) => {
    const repo = state.repos.find((r) => r.id === repoId);
    return (
      <SidebarRowMotion key={workspace.id} listIndex={listIndex}>
        <SidebarWorkspaceRow workspace={workspace} repoBadge={showRepo ? repo : undefined} targetBranch={repo?.defaultBranch ?? ""} hasRemote={Boolean(repo?.remote)} {...rows.rowProps(repoId, workspace)} />
      </SidebarRowMotion>
    );
  };
  const sel = state.selection;
  const dashboardEnabled = useDashboardEnabled().enabled;
  const routinesAvailable = useRoutinesAvailable();
  // Conductor persists this per collapse key; ours lasts for the session.
  const [groupCollapsed, setGroupCollapsed] = useState(false);
  // Conductor keeps "show hidden repositories" in component state, so it resets on reload.
  const [showHidden, setShowHidden] = useState(false);
  const [repoContext, setRepoContext] = useState<{ repoId: string; x: number; y: number } | null>(null);
  const closeRepoContext = useCallback(() => setRepoContext(null), []);
  // Right-click on "My workspaces" (Conductor's `rBi` around `lBi`'s button): New section… only.
  const [myContext, setMyContext] = useState<Point | null>(null);
  const closeMyContext = useCallback(() => setMyContext(null), []);
  /**
   * Conductor's repository menu (`uBi` @10030179; right-click `Dra` -> `Nra` with menuType
   * "context", the "..." with "menu"): Create workspace (plus; ⌘N in the right-click menu
   * while a workspace of this repo is open), Create from... (link-2, ⌘⇧N), Configuration
   * (settings, ⌘,; opens /settings/repos/$repoId/misc), Hide / Unhide repository (eye-off /
   * eye), separator, Remove repository (trash-2, destructive).
   */
  const repoMenu = (repo: AppState["repos"][number]): MenuEntry[] => {
    const active = sel.kind === "workspace" && sel.repoId === repo.id;
    return [
      { label: "Create workspace", icon: <MenuPlusIcon />, contextShortcut: active ? hint("workspace.create") : undefined, onSelect: () => onOpenDialog("create", repo.id) },
      ...(onCreateFrom ? [{ label: "Create from...", icon: <Link2Icon />, contextShortcut: hint("workspace.createFromPRBranchIssue"), onSelect: () => onCreateFrom(repo.id) }] : []),
      ...(onOpenRepoSettings ? [{ label: "Configuration", icon: <MenuSettingsIcon />, contextShortcut: hint("openSettings"), onSelect: () => onOpenRepoSettings(repo.id) }] : []),
      { label: repo.hidden ? "Unhide repository" : "Hide repository", icon: repo.hidden ? <EyeIcon /> : <EyeOffIcon />, onSelect: () => dispatch({ type: "setRepoHidden", repoId: repo.id, hidden: !repo.hidden }) },
      ...(onRemoveRepository ? ["-" as const, { label: "Remove repository", icon: <Trash2Icon />, destructive: true, onSelect: () => onRemoveRepository(repo.id) }] : []),
    ];
  };
  // The add-repository popover (Conductor's `wra`): "Add project…" opens it on the next
  // frame, after the header menu closes (`yra`); ⌥⌘A (`nav.addRepository`) opens it too.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuAnchor = useRef<HTMLSpanElement>(null);
  useKeybindings({ "nav.addRepository": () => setAddMenuOpen(true) });
  // The command palette's "Add project" opens the same popover (Conductor's `g9e.open()`).
  useEffect(() => {
    const open = () => setAddMenuOpen(true);
    window.addEventListener(OPEN_ADD_PROJECT_MENU, open);
    return () => window.removeEventListener(OPEN_ADD_PROJECT_MENU, open);
  }, []);
  // "Filter by project" (Conductor's `pra`, setting `sidebar_repo_filter`). Repos arrive from
  // conductor.db after the first render (before that, only path-less placeholders for collapsed
  // repos), so a stale filter is cleared only once real repos have loaded.
  const [repoFilter, setRepoFilter] = useRepoFilter(state.repos, state.repos.some((r) => r.path !== ""));
  // The filter narrows the repo groups only; Pinned keeps every repo's rows (`hBi`).
  const listed = filterRepoGroups(visibleRepos(state.repos, showHidden), repoFilter);
  // Dragging is off with a single listed repo, as in Conductor.
  const canDrag = listed.length > 1;
  // Workspaces the usage popover can group processes under (by cwd).
  const usageWorkspaces: UsageWorkspace[] = state.repos.flatMap((r) =>
    r.workspaces.flatMap((w) => (w.path ? [{ localId: w.id, directoryName: w.directoryName ?? w.name, workspacePath: w.path }] : [])),
  );
  // Conductor's repo list is a @hello-pangea/dnd column (renderApp @10042299): a drop moves the
  // dragged repo to the target row's place in the full id list, hidden repos included.
  const onRepoDragEnd = (result: DropResult) => {
    const from = listed[result.source.index]?.id;
    const to = result.destination ? listed[result.destination.index]?.id : undefined;
    if (!from || !to || from === to) return;
    dispatch({ type: "reorderRepos", ids: moveRepo(state.repos.map((r) => r.id), from, to) });
  };
  return (
    <aside className="sidebar" aria-label="Repositories and workspaces">
      {/* Header: the whole block drags the window ("deep"); its buttons and menus don't (tauri drag.js skips clickable elements).
          Top bar holds the sidebar toggle, back/forward at the top right. */}
      <div className="sb-header" data-tauri-drag-region="deep">
        <div className="sb-topbar">
          <button
            type="button"
            className="sb-toggle"
            aria-label="Toggle left sidebar"
            title={titleWithShortcut("Toggle left sidebar", hint("view.toggleLeftSidebar"))}
            onClick={() => dispatch({ type: "toggleSidebar" })}
          >
            <SidebarIcon size={16} />
          </button>
        </div>
        <div className="sb-history">
          <ResourceUsagePill workspaces={usageWorkspaces} />
          <button type="button" className="sb-icon-btn" aria-label="Go back" title={titleWithShortcut("Go back", hint("nav.back"))} disabled={!nav.canBack} onClick={nav.onBack}>
            <ArrowLeftIcon size={12} />
          </button>
          <button type="button" className="sb-icon-btn" aria-label="Go forward" title={titleWithShortcut("Go forward", hint("nav.forward"))} disabled={!nav.canForward} onClick={nav.onForward}>
            <ArrowRightIcon size={12} />
          </button>
        </div>

        <div className="sb-primary">
          <AccountMenu onOpenSettings={onOpenSettings} onError={onError} />
          {/* "Dashboard" (Conductor's `Aia` @10,029,038): shown while the Experimental setting is on, above Home. */}
          {dashboardEnabled && (
            <NavRow icon={<LayoutGridIcon size={12} />} label="Dashboard" shortcut="" active={sel.kind === "dashboard"} onClick={() => dispatch({ type: "select", selection: { kind: "dashboard" } })} />
          )}
          <NavRow icon={<HomeIcon size={12} />} label="Home" shortcut={hint("nav.home")} title={titleWithShortcut("Home", hint("nav.home"))} active={sel.kind === "root"} onClick={() => dispatch({ type: "select", selection: { kind: "root" } })} />
          <NavRow icon={<PlusIcon size={12} />} label="Create" shortcut={hint("workspace.create")} onClick={() => onOpenDialog("create")} />
          {/* "Routines" (Conductor's `uy` row after Create, active on /routines*): Conductor shows it for a cloud
              organization; ours runs on Reason Loops, so it shows once Reason is signed in. */}
          {routinesAvailable && (
            <NavRow icon={<PlayIcon size={12} />} label="Routines" shortcut="" active={sel.kind === "routines"} onClick={() => dispatch({ type: "select", selection: { kind: "routines" } })} />
          )}
          <NavRow icon={<SearchIcon size={12} />} label="Search" shortcut={hint("toggleCommandPalette")} onClick={onSearch} />
        </div>
      </div>

      <nav className="repo-list" ref={scrollRoot}>
        {pinned.length > 0 && (
          <SidebarGroup label="Pinned" count={pinned.length} pinnedDropZone isDropTarget={dropTarget?.type === "pinned"}>
            <SidebarPresence>{pinned.map((entry, index) => row(entry, index))}</SidebarPresence>
          </SidebarGroup>
        )}
        {/* Always mounted, like Conductor's `sBi` (empty:hidden), so the last section can animate out. */}
        <section className="sb-nav-sections" aria-label="Sections" data-navigation-sections-section="">
          <SidebarPresence>
            {sections.map((group, i) => (
              <NavSectionGroup
                key={group.section.id}
                group={group}
                isDropTarget={dropTarget?.type === "section" && dropTarget.sectionId === group.section.id}
                isDragging={drag.dragging?.gesture.kind === "section" && drag.dragging.gesture.sectionId === group.section.id}
                indicator={reorderIndicator(dropTarget, i, i === sections.length - 1)}
                isFirst={i === 0}
                onHeaderPointerDown={(e) => drag.sectionPointerDown(e, group.section.id)}
                collapsed={collapsedSections.has(group.section.id)}
                onToggle={() => toggleSection(group.section.id)}
                menuItems={sectionMenu(group.section.id)}
                renderRow={row}
              />
            ))}
          </SidebarPresence>
        </section>
        {/* My workspaces takes rows dragged out of a section or off Pinned (Conductor's `Gra`, `data-workspace-unsectioned-drop`). */}
        <section className="sb-my-workspaces" aria-label="My workspaces" data-drop-target={dropTarget?.type === "unsectioned" || undefined} {...{ [DROP_ATTR.unsectioned]: "" }}>
        {/* "My workspaces" section header (Conductor's `lBi`): label, hover chevron, "..." menu with Add project. */}
        <div className="sb-section-header" onContextMenu={(e) => { e.preventDefault(); setMyContext({ x: e.clientX, y: e.clientY }); }}>
          <button type="button" className="sb-section-toggle" aria-expanded={!groupCollapsed} onClick={() => setGroupCollapsed(!groupCollapsed)}>
            <span className="sb-section-label">My workspaces</span>
            <span className="sb-section-spacer" aria-hidden />
            <span className="sb-section-chevron" data-collapsed={groupCollapsed || undefined}>
              {groupCollapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}
            </span>
          </button>
          {myContext && (
            <ContextMenu at={myContext} onClose={closeMyContext} label="My workspaces actions">
              <CtxItem icon={<MenuPlusIcon />} onSelect={() => setSectionDialog({ mode: "create" })}>New section…</CtxItem>
            </ContextMenu>
          )}
          <HeaderMenu label="My workspaces" className="sb-section-menu" contextOpen={!!myContext} items={[
            { key: "group-by", render: (close) => <SidebarRadioSubmenu label="Group by" options={SIDEBAR_GROUP_OPTIONS} selected={state.sidebarGroupBy ?? "repo"} onChange={(value) => {
              dispatch({ type: "collapseSidebarGroups", groupBy: value });
              void setAppPref({ key: "sidebar_group_by", value }).catch((err) => console.error("Could not save sidebar grouping", err));
            }} onClose={close} /> },
            { key: "filter-by-project", render: (close) => <ProjectFilterSubmenu repos={state.repos} filter={repoFilter} onChange={setRepoFilter} onClose={close} /> },
            { key: "sort-by", render: (close) => <SidebarRadioSubmenu label="Sort by" options={SIDEBAR_SORT_OPTIONS} selected={state.sidebarSort ?? "updated"} onChange={(value) => { void setAppPref({ key: "sidebar_sort_by", value }).catch((err) => console.error("Could not save sidebar sort", err)); }} onClose={close} /> },
            "-",
            { label: "New section…", icon: <MenuPlusIcon />, onSelect: () => setSectionDialog({ mode: "create" }) },
            { label: "Add project…", icon: <FolderPlusIcon />, onSelect: () => requestAnimationFrame(() => setAddMenuOpen(true)) },
          ]} />
          <span ref={addMenuAnchor} className="sb-add-menu-anchor" aria-hidden />
          <SidebarAddRepositoryMenu
            open={addMenuOpen}
            onOpenChange={setAddMenuOpen}
            anchorRef={addMenuAnchor}
            repos={state.repos}
            onOpenProject={onOpenProject}
            onOpenGitHubProject={() => onOpenDialog("clone")}
            onQuickStart={() => onOpenDialog("quickstart")}
            onAddProjectAt={(path) => onAddProjectAt?.(path)}
          />
        </div>
        {!groupCollapsed && state.repos.length === 0 && <p className="sidebar-empty">Add a project to get started.</p>}
        {!groupCollapsed && state.sidebarGroupBy === "status" && <SidebarStatusGroups state={state} dispatch={dispatch} renderRow={(entry, index) => row(entry, index, !repoFilter)} />}
        {!groupCollapsed && state.sidebarGroupBy !== "status" && (
          <DragDropContext onDragEnd={onRepoDragEnd}>
          <Droppable droppableId="repo-list">
            {(drop, dropState) => (
          <div className="sb-repo-groups" ref={drop.innerRef} {...drop.droppableProps} data-dragging-over={dropState.isDraggingOver || undefined}>
            {listed.map((repo, repoIndex) => {
              const folded = isRepoCollapsed(repo, sel, sectioned);
              return (
          <Draggable key={repo.id} draggableId={repo.id} index={repoIndex} isDragDisabled={!canDrag}>
            {(drag, dragState) => (
          <div
            ref={drag.innerRef}
            {...drag.draggableProps}
            className="sb-repo-group"
            data-dragging={dragState.isDragging || undefined}
          >
            <div className="sb-repo">
              <div
                {...drag.dragHandleProps}
                className="sb-repo-header"
                role="button"
                tabIndex={0}
                aria-expanded={!folded}
                onClick={() => dispatch({ type: "toggleRepo", repoId: repo.id })}
                onContextMenu={(e) => { e.preventDefault(); setRepoContext({ repoId: repo.id, x: e.clientX, y: e.clientY }); }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  dispatch({ type: "toggleRepo", repoId: repo.id });
                }}
              >
                <div className="sb-repo-main">
                  <span className="sb-repo-lead">
                    <RepoIcon repo={repo} />
                    <span className="sb-repo-chevron" aria-hidden>{folded ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}</span>
                  </span>
                  <span className="sb-repo-name" data-hidden={repo.hidden || undefined}>{repo.name}</span>
                  {folded && repo.workspaces.length > 0 && <span className="sb-repo-count">{repo.workspaces.length}</span>}
                </div>
                <span className="sb-repo-spacer" aria-hidden />
                <button
                  type="button"
                  className="sb-repo-add"
                  title="Create workspace"
                  aria-label={`Create workspace in ${repo.name}`}
                  onClick={(e) => { e.stopPropagation(); onOpenDialog("create", repo.id); }}
                >
                  <PlusIcon size={16} />
                </button>
              </div>
              <HeaderMenu label={repo.name} className="sb-repo-menu" contextOpen={repoContext?.repoId === repo.id} items={repoMenu(repo)} />
              {repoContext?.repoId === repo.id && <HeaderContextMenu label={repo.name} items={repoMenu(repo)} at={repoContext} onClose={closeRepoContext} />}
            </div>
            {/* An unfolded group with no rows is empty, with no placeholder line (Conductor's `Dra`). */}
            <RepoWorkspaceList repoId={repo.id} collapsed={folded} isEmpty={repo.workspaces.length === 0} empty={null}>
              <SidebarPresence>
                {repoGroupWorkspaces(repo.workspaces, sectioned, state.sidebarSort).map((ws, i) => (
                  <SidebarRowMotion key={ws.id} listIndex={i}>
                    <SidebarWorkspaceRow workspace={ws} targetBranch={repo.defaultBranch} hasRemote={Boolean(repo.remote)} {...rows.rowProps(repo.id, ws)} />
                  </SidebarRowMotion>
                ))}
              </SidebarPresence>
            </RepoWorkspaceList>
          </div>
            )}
          </Draggable>
              );
            })}
            {drop.placeholder}
            {hasHiddenRepos(state.repos) && (
              <button type="button" className="sb-show-hidden" onClick={() => setShowHidden(!showHidden)}>
                {showHidden ? "Hide hidden repositories" : "Show hidden repositories"}
              </button>
            )}
          </div>
            )}
          </Droppable>
          </DragDropContext>
        )}
        </section>
      </nav>
      {drag.overlay}
      {rows.menu}
      {sectionDialog && (
        <SectionDialog
          key={sectionDialog.mode === "edit" ? sectionDialog.sectionId : `create-${sectionDialog.workspaceIdToMove ?? "empty"}`}
          data={sectionDialog}
          onSubmit={(value) => submitSection(sectionDialog, value)}
          onClose={() => setSectionDialog(null)}
        />
      )}

      {/* Footer, after Conductor's `Nna`: px-4 py-3, top border, help and settings icons (h-4 w-4, stroke 1.5) gap-5 at the right. */}
      <div className="sb-footer">
        {/* Conductor's `Nna` shows the account's plan; with no paid entitlement that is a dashed "FREE" badge
            inside a button labelled "View pricing" that opens its pricing page. OpenConductor has no paid plans,
            so the same button opens the project page. */}
        <button type="button" className="sb-plan-btn" aria-label="View pricing" onClick={() => void openUrl(PRICING_URL)}>
          <span className="sb-plan-badge">FREE</span>
        </button>
        <div className="sb-footer-actions">
          <HelpMenu appVersion={info?.version} onOpenShortcuts={onOpenShortcuts} onSubmitPrompt={onSubmitPrompt} onOpenDiagnostics={onOpenDiagnostics} />
          {/* Conductor's footer Settings (`Nna`): Tooltip "Settings" with the openSettings shortcut. */}
          <Tooltip content="Settings" shortcut={hint("openSettings")}>
            <button type="button" className="sb-footer-btn" aria-label="Settings" onClick={onOpenSettings}>
              <SettingsIcon size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      </div>
      {renaming && renamingWs && (
        <RenameWorkspaceDialog
          key={renamingWs.id}
          repoId={renaming.repoId}
          workspace={renamingWs}
          dispatch={dispatch}
          onClose={() => setRenaming(null)}
          onError={(message) => onError?.(message)}
        />
      )}
    </aside>
  );
}
