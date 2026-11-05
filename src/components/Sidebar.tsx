import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject } from "react";
import type { AppState } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import type { AppInfo } from "../backend";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronIcon, HomeIcon, MoreIcon, PlusIcon, SearchIcon, SettingsIcon, SidebarIcon } from "./Icons";
import { COMMANDS } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";
import { createPortal } from "react-dom";
import { HelpMenu } from "./HelpMenu";
import { RepoIcon } from "./RepoIcon";
import { RepoIconDialog } from "./RepoIconDialog";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import { hasHiddenRepos, moveRepo, visibleRepos } from "../state/repoOrder";
import { SidebarWorkspaceRow, useWorkspaceRows, type RowCallbacks } from "./SidebarWorkspaceRow";
import { RepoWorkspaceList } from "./PendingWorkspaceRow";
import { SidebarGroup } from "./SidebarSections";
import { pinnedEntries, repoGroupWorkspaces, sectionEntries, type SidebarSection } from "../state/sidebarOrder";
import { newId } from "../state/names";
import { SectionDialog, type SectionDialogMode } from "./SectionDialog";
import { ProjectFilterSubmenu } from "./home/ProjectFilterSubmenu";
import { useRepoFilter } from "../home/useRepoFilter";
import { filterRepoGroups } from "../home/repoFilter";
import { SidebarAddRepositoryMenu } from "./AddRepositoryMenu";
import { useKeybindings } from "../keybindings/KeybindingsProvider";

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
  onOpenDialog: (d: DialogKind, repoId?: string) => void;
  onOpenProject: () => void;
  /** A Recents row of the add-repository menu: add that folder as Open project would. */
  onAddProjectAt?: (path: string) => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onSearch: () => void;
  nav: NavControls;
  info: AppInfo | null;
  /** Local computer label; Conductor shows "<name>'s Mac", or "My Mac" with no user name. */
  computerName?: string;
  /* sidebar: workspace row menu callbacks (rename dialog, archive flow) */
  onRenameWorkspace?: RowCallbacks["onRename"];
  onArchiveWorkspace?: RowCallbacks["onArchive"];
  /** Shows an error toast (icon upload failures). */
  onError?: (message: string) => void;
}

function NavRow({ icon, label, shortcut, active, onClick }: { icon: JSX.Element; label: string; shortcut: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sb-row" data-active={active ? "true" : undefined} title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick}>
      <span className="sb-row-icon">{icon}</span>
      <span className="sb-row-label">{label}</span>
      {shortcut && <kbd className="sb-row-hint">{shortcut}</kbd>}
    </button>
  );
}

interface MenuItem { label: string; onSelect: () => void; shortcut?: string; destructive?: boolean }
/** A custom entry, such as a submenu, rendered with the menu's close function. */
interface MenuNode { key: string; render: (close: () => void) => ReactNode }
/** A menu entry, a custom node, or "-" for a separator line. */
type MenuEntry = MenuItem | MenuNode | "-";

/** Menu panel shared by the hover "..." trigger and the right-click context menu. */
function MenuPanel({ items, close, at }: { items: MenuEntry[]; close: () => void; at?: { x: number; y: number } }) {
  return (
    <div className="sb-menu" role="menu" data-context={at ? "true" : undefined} style={at ? { position: "fixed", left: at.x, top: at.y, right: "auto" } : undefined}>
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
 * `contextAt` opens the same items at the pointer, for a right-click on the header.
 */
function HeaderMenu({ label, items, className, contextAt, onContextClose }: { label: string; items: MenuEntry[]; className: string; contextAt?: { x: number; y: number } | null; onContextClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); onContextClose?.(); }, [onContextClose]);
  useDismiss(open, ref, close);
  useDismiss(!!contextAt, portalRef, close);
  return (
    <div ref={ref} className={`sb-menu-anchor ${className}`} data-open={open || !!contextAt || undefined}>
      <button type="button" className="sb-menu-trigger" aria-label={`${label} actions`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onContextClose?.(); setOpen(!open); }}>
        <MoreIcon size={14} />
      </button>
      {open && !contextAt && <MenuPanel items={items} close={close} />}
      {/* The anchor is transformed and the list scrolls, so the pointer menu renders on <body>. */}
      {contextAt && createPortal(<div ref={portalRef} className="sb-context-root"><MenuPanel items={items} close={close} at={contextAt} /></div>, document.body)}
    </div>
  );
}

/**
 * One user section (Conductor's `Yia`): header with emoji, name, a count while
 * collapsed and the hover chevron; its "..." / right-click menu (`oBi`); the
 * section's rows, or "Drag a workspace here" when it has none.
 */
function NavSectionGroup({ group, collapsed, onToggle, menuItems, renderRow }: {
  group: SidebarSection;
  collapsed: boolean;
  onToggle: () => void;
  menuItems: MenuEntry[];
  renderRow: (entry: SidebarSection["entries"][number]) => JSX.Element;
}) {
  const { section, entries } = group;
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(null);
  const closeContext = useCallback(() => setContextAt(null), []);
  return (
    <div className="sb-nav-section" data-navigation-section-drop-id={section.id}>
      <div className="sb-section-header" onContextMenu={(e) => { e.preventDefault(); setContextAt({ x: e.clientX, y: e.clientY }); }}>
        <button type="button" className="sb-section-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {section.emoji !== undefined && <span className="sb-section-emoji" aria-hidden>{section.emoji}</span>}
          <span className="sb-section-label">{section.name}</span>
          {collapsed && <span className="sb-group-count">{entries.length}</span>}
          <span className="sb-section-spacer" aria-hidden />
          <span className="sb-section-chevron" data-collapsed={collapsed || undefined}>
            {collapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}
          </span>
        </button>
        <HeaderMenu label={section.name} className="sb-section-menu" items={menuItems} contextAt={contextAt} onContextClose={closeContext} />
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

export function Sidebar({ state, dispatch, onOpenDialog, onOpenProject, onAddProjectAt, onOpenSettings, onOpenShortcuts, onSearch, nav, info, computerName = "My Mac", onRenameWorkspace, onArchiveWorkspace, onError }: Props) {
  // Row menu > Rename opens the Rename workspace dialog unless the host handles it.
  const [renaming, setRenaming] = useState<{ repoId: string; workspaceId: string } | null>(null);
  const openRename = useCallback<NonNullable<RowCallbacks["onRename"]>>((repoId, ws) => setRenaming({ repoId, workspaceId: ws.id }), []);
  const renamingWs = renaming && state.repos.find((r) => r.id === renaming.repoId)?.workspaces.find((w) => w.id === renaming.workspaceId);
  // Conductor keeps each section's collapse under `section-<id>`; ours lasts for the session.
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set());
  const [sectionDialog, setSectionDialog] = useState<SectionDialogMode | null>(null);
  const rows = useWorkspaceRows(state, dispatch, {
    onRename: onRenameWorkspace ?? openRename,
    onArchive: onArchiveWorkspace,
    onNewSection: (ws) => setSectionDialog({ mode: "create", workspaceIdToMove: ws.id }),
    collapsedSections,
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
    return [
      { label: "Edit section", onSelect: () => s && setSectionDialog({ mode: "edit", sectionId, name: s.name, emoji: s.emoji }) },
      { label: "New section…", onSelect: () => setSectionDialog({ mode: "create", beforeSectionId: sectionId }) },
      "-",
      { label: "Delete section", destructive: true, onSelect: () => dispatch({ type: "deleteSection", sectionId }) },
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
  const [iconRepoId, setIconRepoId] = useState<string | null>(null);
  const iconRepo = iconRepoId ? state.repos.find((r) => r.id === iconRepoId) : undefined;
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
      {/* Top bar: drag region with the sidebar toggle, back/forward at the top right. */}
      <div className="sb-header">
        <div className="sb-topbar" data-tauri-drag-region>
          <button
            type="button"
            className="sb-toggle"
            aria-label="Toggle left sidebar"
            title={`Toggle left sidebar (${hint("view.toggleLeftSidebar")})`}
            onClick={() => dispatch({ type: "toggleSidebar" })}
          >
            <SidebarIcon size={16} />
          </button>
        </div>
        <div className="sb-history">
          <button type="button" className="sb-icon-btn" aria-label="Go back" title={`Go back (${hint("nav.back")})`} disabled={!nav.canBack} onClick={nav.onBack}>
            <ArrowLeftIcon size={12} />
          </button>
          <button type="button" className="sb-icon-btn" aria-label="Go forward" title={`Go forward (${hint("nav.forward")})`} disabled={!nav.canForward} onClick={nav.onForward}>
            <ArrowRightIcon size={12} />
          </button>
        </div>

        <div className="sb-primary">
          {/* Computer switcher. Only the local computer exists for now, so the menu is not built yet. */}
          <div className="sb-row sb-computer" title={computerName}>
            <span className="sb-row-icon">
              <span className="sb-avatar" aria-hidden>{computerName.charAt(0).toUpperCase()}</span>
            </span>
            <span className="sb-computer-name">{computerName}</span>
            <ChevronDownIcon size={12} />
          </div>
          <NavRow icon={<HomeIcon size={12} />} label="Home" shortcut={hint("nav.home")} onClick={() => dispatch({ type: "select", selection: { kind: "home" } })} />
          <NavRow icon={<PlusIcon size={12} />} label="Create" shortcut={hint("workspace.create")} onClick={() => onOpenDialog("create")} />
          <NavRow icon={<SearchIcon size={12} />} label="Search" shortcut={hint("toggleCommandPalette")} onClick={onSearch} />
        </div>
      </div>

      <nav className="repo-list">
        {pinned.length > 0 && (
          <SidebarGroup label="Pinned" count={pinned.length}>
            {pinned.map(row)}
          </SidebarGroup>
        )}
        {sections.length > 0 && (
          <section className="sb-nav-sections" aria-label="Sections" data-navigation-sections-section="">
            {sections.map((group) => (
              <NavSectionGroup
                key={group.section.id}
                group={group}
                collapsed={collapsedSections.has(group.section.id)}
                onToggle={() => toggleSection(group.section.id)}
                menuItems={sectionMenu(group.section.id)}
                renderRow={row}
              />
            ))}
          </section>
        )}
        {/* "My workspaces" section header (Conductor's `lBi`): label, hover chevron, "..." menu with Add project. */}
        <div className="sb-section-header">
          <button type="button" className="sb-section-toggle" aria-expanded={!groupCollapsed} onClick={() => setGroupCollapsed(!groupCollapsed)}>
            <span className="sb-section-label">My workspaces</span>
            <span className="sb-section-spacer" aria-hidden />
            <span className="sb-section-chevron" data-collapsed={groupCollapsed || undefined}>
              {groupCollapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}
            </span>
          </button>
          <HeaderMenu label="My workspaces" className="sb-section-menu" items={[
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
              <HeaderMenu
                label={repo.name}
                className="sb-repo-menu"
                contextAt={repoContext?.repoId === repo.id ? repoContext : null}
                onContextClose={closeRepoContext}
                items={[
                  { label: "Create workspace", shortcut: repoContext?.repoId === repo.id && sel.kind === "workspace" && sel.repoId === repo.id ? hint("workspace.create") : undefined, onSelect: () => onOpenDialog("create", repo.id) },
                  { label: "Change icon…", onSelect: () => setIconRepoId(repo.id) },
                  { label: repo.hidden ? "Unhide repository" : "Hide repository", onSelect: () => dispatch({ type: "setRepoHidden", repoId: repo.id, hidden: !repo.hidden }) },
                ]}
              />
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
      </nav>
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
          <button type="button" className="sb-footer-btn" aria-label="Settings" title={`Settings (${hint("openSettings")})`} onClick={onOpenSettings}>
            <SettingsIcon size={16} strokeWidth={1.5} />
          </button>
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
      {iconRepo && (
        <RepoIconDialog
          repo={iconRepo}
          onChange={(icon) => dispatch({ type: "setRepoIcon", repoId: iconRepo.id, icon })}
          onClose={() => setIconRepoId(null)}
          onError={(message) => onError?.(message)}
        />
      )}
    </aside>
  );
}
