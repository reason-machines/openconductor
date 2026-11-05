// parity:sidebar.ws-diffstat
// Live +/- counts for one sidebar row. Like Conductor's row hook (`DZo`), the
// changed files load only while the row is on screen or selected, and are
// summed with lockfiles left out (src/state/sidebarDiffStat.ts). Outside the
// desktop app, or before the worktree exists, the stored counts are shown.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { Workspace } from "../state/types";
import { sumDiffStat, type ChangedFile, type DiffStat } from "../state/sidebarDiffStat";

/** How often the selected row re-reads its counts while it stays selected. */
const SELECTED_REFRESH_MS = 10_000;

export function useRowDiffStat(ws: Workspace, base: string, active: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [live, setLive] = useState<DiffStat | null>(null);
  const worktree = inTauri() ? ws.path : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!worktree || !el || typeof IntersectionObserver === "undefined") return;
    const root = el.closest("[data-sidebar-scroll-root]");
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.1, root });
    io.observe(el);
    return () => io.disconnect();
  }, [worktree]);

  const enabled = worktree !== undefined && (onScreen || active);
  useEffect(() => {
    if (!enabled || !worktree) return;
    let cancelled = false;
    const load = () =>
      invoke<ChangedFile[]>("sidebar_workspace_changes", { repo: worktree, base }).then(
        (files) => !cancelled && setLive(sumDiffStat(files)),
        () => {},
      );
    load();
    window.addEventListener("focus", load);
    const timer = active ? setInterval(load, SELECTED_REFRESH_MS) : undefined;
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      clearInterval(timer);
    };
  }, [enabled, worktree, base, active]);

  return { ref, stat: live ?? ws.diff, onScreen };
}
