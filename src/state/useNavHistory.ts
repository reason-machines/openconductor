import { useEffect, useState, type Dispatch } from "react";
import type { Action } from "./store";
import type { AppState, Selection } from "./types";
import { canGoBack, canGoForward, current, prune, sameSelection, startHistory, step, visit } from "./history";

const exists = (state: AppState) => (sel: Selection) =>
  sel.kind !== "workspace" || state.repos.some((r) => r.id === sel.repoId && r.workspaces.some((w) => w.id === sel.workspaceId));

/** Records each selection and moves through it for the sidebar arrows and nav.back / nav.forward. */
export function useNavHistory(state: AppState, dispatch: Dispatch<Action>) {
  const [history, setHistory] = useState(() => startHistory(state.selection));

  useEffect(() => {
    setHistory((h) => visit(prune(h, exists(state)), state.selection));
  }, [state]);

  const go = (delta: -1 | 1) => {
    const next = step(prune(history, exists(state)), delta);
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
