// React side of composerMinimize.ts (Conductor's hook `gTo`).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { expand as expandState, initialMinimize, minimizeIfEmpty as minimizeState, onCanMinimizeChange, onViewChange, type MinimizeState } from "./composerMinimize.ts";

export interface ComposerMinimize extends MinimizeState {
  /** Focus, a click on the box or ⌘L: back to the full composer. */
  expand: () => void;
  /** A scroll in the content tab: down to one line when allowed. */
  minimizeIfEmpty: () => void;
}

export function useComposerMinimize(viewingContent: boolean, can: boolean): ComposerMinimize {
  const [state, setState] = useState(() => initialMinimize(viewingContent, can));
  const canRef = useRef(can);
  const viewRef = useRef(viewingContent);
  const expandedAt = useRef(0);

  useEffect(() => {
    canRef.current = can;
    setState((s) => onCanMinimizeChange(s, can));
  }, [can]);

  useLayoutEffect(() => {
    if (viewRef.current === viewingContent) return;
    viewRef.current = viewingContent;
    setState((s) => onViewChange(s, viewingContent, can));
  }, [viewingContent, can]);

  const expand = useCallback(() => {
    expandedAt.current = Date.now();
    setState(expandState);
  }, []);
  const minimizeIfEmpty = useCallback(() => {
    setState((s) => minimizeState(s, { viewingContent: viewRef.current, can: canRef.current, now: Date.now(), expandedAt: expandedAt.current }));
  }, []);

  return { ...state, expand, minimizeIfEmpty };
}
