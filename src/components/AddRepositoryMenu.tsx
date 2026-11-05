import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Repo } from "../state/types";
import { inTauri, pickFolder, recentLocalRepositories } from "../backend";
import { FolderIcon, FolderPlusIcon, GlobeIcon } from "./Icons";
import {
  MENU_WIDTH,
  RECENTS_STALE_MS,
  SPINNER_FRAMES,
  SPINNER_INTERVAL_MS,
  displayRecentPath,
  menuPosition,
  nextMenuIndex,
  normalizeRecentRepos,
  recentsNotAdded,
  showRecents,
  type RecentLocalRepo,
} from "./addRepositoryMenuModel";
import { cloneRepository, type RepositoryDto } from "../workspace/api";
import {
  CLONE_DESTINATION_TITLE,
  CLONE_PLACEHOLDER,
  CLONING,
  INVALID_CLONE_URL,
  cloneFailedMessage,
  parseCloneUrl,
  type CloneSource,
} from "../workspace/repoPicker";

interface Props {
  disabled?: boolean;
  /** Label of the closed button: "Add…" next to the picker, "Add repository" when there are none. */
  label: string;
  primary?: boolean;
  onOpenProject: () => void;
  onCloned: (repo: RepositoryDto, source: CloneSource) => void;
  onBusyChange?: (busy: boolean) => void;
}

type Mode = { kind: "closed" } | { kind: "menu" } | { kind: "clone"; status: "idle" | "cloning"; error?: string };

// Outside the desktop app there is no folder picker; clones "land" here.
const BROWSER_CLONE_PARENT = "~/code";

/** "Add repository" in the create dialog: Open project, or Clone repo from a pasted URL. */
export function AddRepositoryMenu({ disabled, label, primary, onOpenProject, onCloned, onBusyChange }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [url, setUrl] = useState("");
  const cloning = mode.kind === "clone" && mode.status === "cloning";

  function setCloning(on: boolean, error?: string) {
    setMode({ kind: "clone", status: on ? "cloning" : "idle", error });
    onBusyChange?.(on);
  }

  async function clone() {
    if (cloning) return;
    const source = parseCloneUrl(url);
    if (!source) return setMode({ kind: "clone", status: "idle", error: INVALID_CLONE_URL });
    const parent = inTauri() ? await pickFolder(CLONE_DESTINATION_TITLE) : BROWSER_CLONE_PARENT;
    if (!parent) return;
    setCloning(true);
    try {
      const repo = await cloneRepository(source.url, parent, source.name);
      onBusyChange?.(false);
      setMode({ kind: "closed" });
      setUrl("");
      onCloned(repo, source);
    } catch (err) {
      setCloning(false, cloneFailedMessage(err));
    }
  }

  return (
    <div className="add-repo">
      <button
        type="button"
        className={`btn ${primary ? "btn-primary" : "btn-small"}`}
        aria-haspopup="menu"
        aria-expanded={mode.kind !== "closed"}
        disabled={disabled || cloning}
        onClick={() => setMode(mode.kind === "menu" ? { kind: "closed" } : { kind: "menu" })}
      >
        {label}
      </button>
      {mode.kind === "clone" && (
      <div className="add-repo-pop add-repo-clone" onKeyDown={(e) => e.key === "Escape" && !cloning && (e.stopPropagation(), setMode({ kind: "closed" }))}>
        <div className="field-row">
          <input
            autoFocus
            value={url}
            placeholder={CLONE_PLACEHOLDER}
            aria-label="Clone URL"
            aria-invalid={!!mode.error}
            disabled={cloning}
            onChange={(e) => {
              setUrl(e.target.value);
              if (mode.error) setMode({ kind: "clone", status: "idle" });
            }}
            onKeyDown={(e) => {
              // Enter clones; it must not submit the surrounding create form.
              if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              void clone();
            }}
          />
          <button type="button" className="btn btn-small btn-primary" onClick={() => void clone()} disabled={cloning || !url.trim()}>
            {cloning ? "Cloning..." : "Clone"}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setMode({ kind: "closed" })} disabled={cloning}>Cancel</button>
        </div>
        {mode.error ? (
          <span className="error small" role="alert">{mode.error}</span>
        ) : cloning ? (
          <span className="muted small" role="status">{CLONING}</span>
        ) : null}
      </div>
      )}
      {mode.kind === "menu" && (
        <div className="add-repo-pop add-repo-menu" role="menu" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setMode({ kind: "closed" }))}>
          <button type="button" role="menuitem" autoFocus onClick={() => (setMode({ kind: "closed" }), onOpenProject())}>Open project</button>
          <button type="button" role="menuitem" onClick={() => setMode({ kind: "clone", status: "idle" })}>Clone repo</button>
        </div>
      )}
    </div>
  );
}

// --- Sidebar add-repository menu (Conductor's `Gji` body in the `wra` popover) ---

// One list per window, like Conductor's `recentLocalRepositories` query (fresh for 5 minutes).
let recentsCache: { at: number; value: RecentLocalRepo[] } | null = null;
let recentsInFlight: Promise<RecentLocalRepo[]> | null = null;

function fetchRecents(): Promise<RecentLocalRepo[]> {
  recentsInFlight ??= recentLocalRepositories()
    .then(normalizeRecentRepos, () => [])
    .then((value) => {
      recentsCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      recentsInFlight = null;
    });
  return recentsInFlight;
}

/**
 * The recent local repositories. The first load shows as `loading`; later
 * refreshes keep the old list on screen until the new one arrives. Conductor
 * starts the query when the sidebar mounts (`iWt(!0)` in `wra`), so the list is
 * usually ready before the menu opens.
 */
export function useRecentLocalRepos(): { recents: RecentLocalRepo[]; loading: boolean; refresh: () => void } {
  const [value, setValue] = useState<RecentLocalRepo[] | null>(() => recentsCache?.value ?? null);
  const refresh = useCallback(() => {
    if (recentsCache && Date.now() - recentsCache.at < RECENTS_STALE_MS) return setValue(recentsCache.value);
    void fetchRecents().then(setValue);
  }, []);
  useEffect(refresh, [refresh]);
  return { recents: value ?? [], loading: value === null, refresh };
}

/** `VQo`: a braille spinner, one frame per 100 ms. */
function BrailleSpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return <span className="add-menu-spinner">{SPINNER_FRAMES[frame]}</span>;
}

export interface AddRepositoryActions {
  /** Open project: the folder picker, then the usual folder checks. */
  onOpenProject: () => void;
  /** Open GitHub project: the clone dialog. */
  onOpenGitHubProject: () => void;
  /** Quick start: the quick start dialog. */
  onQuickStart: () => void;
  /** A Recents row: the same checks as Open project, for that folder, without the picker. */
  onAddProjectAt: (path: string) => void;
}

/**
 * `Gji`: Open project, Open GitHub project, Quick start; then, while loading or
 * when there are any, "Recents": local repositories not added yet.
 */
export function AddRepositoryMenuItems({ repos, recents, loading, onActionComplete, ...actions }: AddRepositoryActions & {
  repos: Repo[];
  recents: RecentLocalRepo[];
  loading: boolean;
  onActionComplete: () => void;
}) {
  const notAdded = recentsNotAdded(recents, repos);
  const run = (action: () => void) => () => {
    action();
    onActionComplete();
  };
  return (
    <>
      <button type="button" role="menuitem" className="add-menu-item" onClick={run(actions.onOpenProject)}>
        <FolderIcon size={16} />
        <span>Open project</span>
      </button>
      <button type="button" role="menuitem" className="add-menu-item" onClick={run(actions.onOpenGitHubProject)}>
        <span className="add-menu-icon-secondary"><GlobeIcon size={16} /></span>
        <span>Open GitHub project</span>
      </button>
      <button type="button" role="menuitem" className="add-menu-item" onClick={run(actions.onQuickStart)}>
        <span className="add-menu-icon-secondary"><FolderPlusIcon size={16} /></span>
        <span>Quick start</span>
      </button>
      {showRecents(loading, notAdded) && (
        <>
          <div className="add-menu-sep" role="separator" />
          <div className="add-menu-label">Recents</div>
          {loading ? (
            <div className="add-menu-loading" role="status" aria-label="Loading recent repos">
              <BrailleSpinner />
            </div>
          ) : (
            notAdded.map((r) => (
              <button key={r.path} type="button" role="menuitem" className="add-menu-item add-menu-recent" title={r.path} onClick={run(() => actions.onAddProjectAt(r.path))}>
                <span className="add-menu-recent-icon"><FolderIcon size={14} /></span>
                <span className="add-menu-recent-path">{displayRecentPath(r.path)}</span>
              </button>
            ))
          )}
        </>
      )}
    </>
  );
}

/**
 * `wra`: the popover the "My workspaces" header's "Add project…" item and
 * ⌥⌘A (`nav.addRepository`) open. It hangs from `anchorRef` (a point 24px in
 * from the header's right edge), 320px wide, focus starts on the first item,
 * the arrow keys move through the items, and Escape or a click outside closes it.
 */
export function SidebarAddRepositoryMenu({ open, onOpenChange, anchorRef, repos, ...actions }: AddRepositoryActions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  repos: Repo[];
}) {
  const { recents, loading, refresh } = useRecentLocalRepos();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const anchor = anchorRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const p = menuPosition({ x: anchor.right, y: anchor.bottom }, { width: MENU_WIDTH, height: menu.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    setPos((prev) => (prev && prev.left === p.left && prev.top === p.top ? prev : { left: p.left, top: p.top }));
  });
  // Focus the first item once the menu is placed (a hidden element cannot take focus).
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed) menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open, placed]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    // Escape closes it wherever focus is, as the popover's dismiss handling does.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onOpenChange]);
  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Add repository"
      className="add-menu"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? undefined : "hidden" }}
      onKeyDown={(e) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
        const next = nextMenuIndex(e.key, items.findIndex((el) => el === document.activeElement), items.length);
        if (next === null) return;
        e.preventDefault();
        e.stopPropagation();
        items[next]?.focus();
      }}
    >
      <AddRepositoryMenuItems repos={repos} recents={recents} loading={loading} onActionComplete={() => onOpenChange(false)} {...actions} />
    </div>,
    document.body,
  );
}
