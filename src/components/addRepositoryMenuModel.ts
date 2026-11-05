// The sidebar's add-repository menu (Conductor 0.87.6, decoded renderApp-D_fmY7hW.js):
// the shared menu body `Gji` @ byte 9,785,064 (Open project, Open GitHub project,
// Quick start, then "Recents"), mounted by the "My workspaces" header's popover `wra`
// @ 10,069,794. Pure parts only; the components are in AddRepositoryMenu.tsx.
import type { Repo } from "../state/types";

export interface RecentLocalRepo {
  path: string;
}

/**
 * `jQo`: one path per line, trimmed, trailing slashes removed, empty lines and
 * repeats dropped, order kept.
 */
export function normalizeRecentRepos(paths: readonly string[]): RecentLocalRepo[] {
  const seen = new Set<string>();
  const out: RecentLocalRepo[] = [];
  for (const raw of paths) {
    const path = raw.trim().replace(/\/+$/, "");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({ path });
  }
  return out;
}

/**
 * Recents leave out a folder that is already a project: Conductor matches each
 * repository's `rootPath` and `mainWorktreePath` (`qQo`); ours has one path.
 */
export function recentsNotAdded(recents: readonly RecentLocalRepo[], repos: readonly Repo[]): RecentLocalRepo[] {
  const added = new Set(repos.map((r) => r.path).filter(Boolean));
  return recents.filter((r) => !added.has(r.path));
}

/** `GQo`: the home folder prefix `/Users/<name>` shows as `~`. */
export function displayRecentPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

/** The "Recents" block shows while the list loads (spinner row) or when it has entries. */
export function showRecents(loading: boolean, recents: readonly RecentLocalRepo[]): boolean {
  return loading || recents.length > 0;
}

/** Braille spinner frames (`Wji`), advanced every 100 ms (`VQo`). */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const SPINNER_INTERVAL_MS = 100;

/**
 * ArrowDown / ArrowUp move focus through the menu items and wrap; any other
 * key, or focus outside the items, leaves focus alone (returns null).
 */
export function nextMenuIndex(key: string, current: number, count: number): number | null {
  if ((key !== "ArrowDown" && key !== "ArrowUp") || count === 0 || current === -1) return null;
  return key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
}

/** Query options of `BQo`: fresh for 5 minutes. */
export const RECENTS_STALE_MS = 5 * 60 * 1000;

export const MENU_WIDTH = 320; // w-80
const SIDE_OFFSET = 4; // sideOffset 4
// The positioner's default collisionPadding (renderApp-D_fmY7hW.js @ byte 555,649: `collisionPadding:g=5`).
const VIEWPORT_PAD = 5;

/**
 * Where the popover goes: below its anchor (a point 24px left of the header's
 * right edge, `absolute right-6 top-full`), its right edge on the anchor
 * (`align: "end"`); flipped above when it does not fit below, and shifted to
 * stay in the window (`collisionAvoidance: { side: "flip", align: "shift" }`).
 */
export function menuPosition(
  anchor: { x: number; y: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; side: "bottom" | "top" } {
  const left = Math.max(VIEWPORT_PAD, Math.min(anchor.x - menu.width, viewport.width - VIEWPORT_PAD - menu.width));
  const below = anchor.y + SIDE_OFFSET;
  if (below + menu.height <= viewport.height - VIEWPORT_PAD || anchor.y - SIDE_OFFSET - menu.height < VIEWPORT_PAD) {
    return { left, top: below, side: "bottom" };
  }
  return { left, top: anchor.y - SIDE_OFFSET - menu.height, side: "top" };
}
