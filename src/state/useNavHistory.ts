import { useEffect, useState, type Dispatch } from "react";
import type { Action } from "./store";
import type { AppState, Selection } from "./types";
import { useBoolPref } from "../settings/useBoolPref";
import { useDashboardEnabled } from "../home/useDashboardEnabled";
import { canGoBack, canGoForward, current, prune, sameSelection, startHistory, step, visit } from "./history";

/**
 * Returns true when a selection is still reachable given the current app state
 * and feature flags (M6d). Routines entries are pruned when cloudUI is OFF;
 * dashboard entries are pruned when the dashboard feature is OFF.
 */
const exists = (state: AppState, cloudUI: boolean, dashboardEnabled: boolean) => (sel: Selection) => {
  if (sel.kind === "routines") return cloudUI;
  if (sel.kind === "dashboard") return dashboardEnabled;
  return sel.kind !== "workspace" || state.repos.some((r) => r.id === sel.repoId && r.workspaces.some((w) => w.id === sel.workspaceId));
};

/** Records each selection and moves through it for the sidebar arrows and nav.back / nav.forward. */
export function useNavHistory(state: AppState, dispatch: Dispatch<Action>) {
  const [history, setHistory] = useState(() => startHistory(state.selection));
  const cloudUI = useBoolPref("experimental_cloud_ui");
  const { enabled: dashboardEnabled } = useDashboardEnabled();

  useEffect(() => {
    setHistory((h) => visit(prune(h, exists(state, cloudUI, dashboardEnabled)), state.selection));
  }, [state, cloudUI, dashboardEnabled]);

  const go = (delta: -1 | 1) => {
    const next = step(prune(history, exists(state, cloudUI, dashboardEnabled)), delta);
    if (sameSelection(current(next), state.selection)) return;
    setHistory(next);
    dispatch({ type: "select", selection: current(next) });
  };

  return {
    canBack: canGoBack(history),
    canForward: canGoForward(history),
    onBack: () => go(-1),
    onForward: () => go(1),
  };
}
