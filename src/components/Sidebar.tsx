import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { AppState } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import type { AppInfo } from "../backend";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronIcon, HomeIcon, MoreIcon, PlusIcon, SearchIcon, SettingsIcon, SidebarIcon } from "./Icons";
import { COMMANDS } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";
import { HelpMenu } from "./HelpMenu";
import { RepoIcon } from "./RepoIcon";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import { hasHiddenRepos, moveRepo, visibleRepos } from "../state/repoOrder";
import { SidebarWorkspaceRow, useWorkspaceRows, type RowCallbacks } from "./SidebarWorkspaceRow";
import { RepoWorkspaceList } from "./PendingWorkspaceRow";
import { SidebarGroup } from "./SidebarSections";
import { pinnedEntries, repoGroupWorkspaces, sectionEntries, type SidebarSection } from "../state/sidebarOrder";
import { newId } from "../state/names";
import { SectionDialog, type SectionDialogMode } from "./SectionDialog";
import { useSidebarDrag, type WorkspaceRef } from "./useSidebarDrag";
import { DROP_ATTR, reorderIndicator, reorderToIndex, workspaceDropAction, type DropTarget } from "../state/navigationSections";
import { ProjectFilterSubmenu } from "./home/ProjectFilterSubmenu";
import { useRepoFilter } from "../home/useRepoFilter";
import { filterRepoGroups } from "../home/repoFilter";
import { SidebarAddRepositoryMenu } from "./AddRepositoryMenu";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { AccountMenu } from "./AccountMenu";
import { ResourceUsagePill } from "./ResourceUsagePill";
import { Tooltip, titleWithShortcut } from "./Tooltip";
import { ContextMenu, MenuItem as CtxItem, MenuSeparator } from "./menu/ContextMenu";
import { EyeIcon, EyeOffIcon, Link2Icon, PencilIcon, PlusIcon as MenuPlusIcon, SettingsIcon as MenuSettingsIcon, Trash2Icon } from "./menu/menuIcons";
import type { WorkspaceRef as UsageWorkspace } from "./resourceUsage";

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

/**
 * A menu entry. `icon` and `contextShortcut` show only in the right-click menu: Conductor's
 * header menus (`uBi`, `oBi`) take `menuType` "context" or "menu" and add the shortcut hints
 * only for "context"; the hover "..." dropdown here keeps its own plain rows.
 */
interface MenuItem { label: string; onSelect: () => void; shortcut?: string; contextShortcut?: string; icon?: ReactNode; destructive?: boolean; disabled?: boolean }
/** A custom entry, such as a submenu, rendered with the menu's close function. */
interface MenuNode { key: string; render: (close: () => void) => ReactNode }
/** A menu entry, a custom node, or "-" for a separator line. */
type MenuEntry = MenuItem | MenuNode | "-";

/** Menu panel of the hover "..." trigger. */
function MenuPanel({ items, close }: { items: MenuEntry[]; close: () => void }) {
  return (
    <div className="sb-menu" role="menu">
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
function HeaderMenu({ label, items, className, contextOpen }: { label: string; items: MenuEntry[]; className: string; contextOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return (
    <div ref={ref} className={`sb-menu-anchor ${className}`} data-open={open || contextOpen || undefined}>
      <button type="button" className="sb-menu-trigger" aria-label={`${label} actions`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <MoreIcon size={14} />
      </button>
      {open && <MenuPanel items={items} close={close} />}
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
  renderRow: (entry: SidebarSection["entries"][number]) => JSX.Element;
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
    <div className="sb-nav-section" data-navigation-section-drop-id={section.id} data-drop-target={isDropTarget || undefined} data-dragging={isDragging || undefined}>
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
          {entries.map(renderRow)}
          {entries.length === 0 && (
            <div className="sb-section-empty">
              <PlusIcon size={14} />
              <span>Drag a workspace here</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ state, dispatch, onOpenDialog, onOpenProject, onAddProjectAt, onOpenSettings, onOpenShortcuts, onSearch, nav, info, onRenameWorkspace, onArchiveWorkspace, onCopyWorkspaceLink, onError, onCreateFrom, onOpenRepoSettings, onRemoveRepository }: Props) {
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
  const row = ({ repoId, workspace }: SidebarSection["entries"][number]) => {
    const repo = state.repos.find((r) => r.id === repoId);
    return <SidebarWorkspaceRow key={workspace.id} workspace={workspace} targetBranch={repo?.defaultBranch ?? ""} hasRemote={Boolean(repo?.remote)} {...rows.rowProps(repoId, workspace)} />;
  };
  const sel = state.selection;
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
  const [dragRepoId, setDragRepoId] = useState<string | null>(null);
  // The add-repository popover (Conductor's `wra`): "Add project…" opens it on the next
  // frame, after the header menu closes (`yra`); ⌥⌘A (`nav.addRepository`) opens it too.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuAnchor = useRef<HTMLSpanElement>(null);
  useKeybindings({ "nav.addRepository": () => setAddMenuOpen(true) });
  const [dropRepoId, setDropRepoId] = useState<string | null>(null);
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
  const dropOn = (targetId: string) => {
    if (dragRepoId && dragRepoId !== targetId) {
      const ids = moveRepo(state.repos.map((r) => r.id), dragRepoId, targetId);
      dispatch({ type: "reorderRepos", ids });
    }
    setDragRepoId(null);
    setDropRepoId(null);
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
          <AccountMenu onOpenSettings={onOpenSettings} />
          <NavRow icon={<HomeIcon size={12} />} label="Home" shortcut={hint("nav.home")} title={titleWithShortcut("Home", hint("nav.home"))} onClick={() => dispatch({ type: "select", selection: { kind: "home" } })} />
          <NavRow icon={<PlusIcon size={12} />} label="Create" shortcut={hint("workspace.create")} onClick={() => onOpenDialog("create")} />
          <NavRow icon={<SearchIcon size={12} />} label="Search" shortcut={hint("toggleCommandPalette")} onClick={onSearch} />
        </div>
      </div>

      <nav className="repo-list" ref={scrollRoot}>
        {pinned.length > 0 && (
          <SidebarGroup label="Pinned" count={pinned.length} pinnedDropZone isDropTarget={dropTarget?.type === "pinned"}>
            {pinned.map(row)}
          </SidebarGroup>
        )}
        {sections.length > 0 && (
          <section className="sb-nav-sections" aria-label="Sections" data-navigation-sections-section="">
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
          </section>
        )}
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
            { label: "Add project…", onSelect: () => requestAnimationFrame(() => setAddMenuOpen(true)) },
            { label: "New section…", onSelect: () => setSectionDialog({ mode: "create" }) },
            { key: "filter-by-project", render: (close) => <ProjectFilterSubmenu repos={state.repos} filter={repoFilter} onChange={setRepoFilter} onClose={close} /> },
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
        {!groupCollapsed && (
          <div className="sb-repo-groups">
            {listed.map((repo) => (
          <div
            key={repo.id}
            className="sb-repo-group"
            data-dragging={dragRepoId === repo.id || undefined}
            data-drop-target={(dropRepoId === repo.id && dragRepoId !== repo.id) || undefined}
            onDragOver={(e) => {
              if (!dragRepoId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropRepoId !== repo.id) setDropRepoId(repo.id);
            }}
            onDrop={(e) => { e.preventDefault(); dropOn(repo.id); }}
          >
            <div className="sb-repo">
              <div
                className="sb-repo-header"
                role="button"
                tabIndex={0}
                aria-expanded={!repo.collapsed}
                draggable={canDrag}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", repo.id);
                  setDragRepoId(repo.id);
                }}
                onDragEnd={() => { setDragRepoId(null); setDropRepoId(null); }}
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
                    <span className="sb-repo-chevron" aria-hidden>{repo.collapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}</span>
                  </span>
                  <span className="sb-repo-name" data-hidden={repo.hidden || undefined}>{repo.name}</span>
                  {repo.collapsed && repo.workspaces.length > 0 && <span className="sb-repo-count">{repo.workspaces.length}</span>}
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
            <RepoWorkspaceList repoId={repo.id} collapsed={!!repo.collapsed} isEmpty={repo.workspaces.length === 0} empty={<p className="ws-empty">No workspaces</p>}>
              {repoGroupWorkspaces(repo.workspaces, sectioned).map((ws) => (
                <SidebarWorkspaceRow key={ws.id} workspace={ws} targetBranch={repo.defaultBranch} hasRemote={Boolean(repo.remote)} {...rows.rowProps(repo.id, ws)} />
              ))}
            </RepoWorkspaceList>
          </div>
            ))}
            {hasHiddenRepos(state.repos) && (
              <button type="button" className="sb-show-hidden" onClick={() => setShowHidden(!showHidden)}>
                {showHidden ? "Hide hidden repositories" : "Show hidden repositories"}
              </button>
            )}
          </div>
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
        <div className="sb-footer-actions">
          <HelpMenu appVersion={info?.version} onOpenShortcuts={onOpenShortcuts} />
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
