import { useEffect, useReducer } from "react";
import { nextPhase, POPUP_MS, presenceAttrs, type Phase } from "./presence.ts";

/**
 * Keeps a popup mounted through its exit transition and drives the Base UI
 * style attributes. Render the element while `mounted` and spread `attrs` on it.
 * The popup mounts in the same render that `open` turns true, so effects keyed
 * on `open` (focusing the first item, outside-click listeners) already see it.
 */
export function usePresence(open: boolean, exitMs: number = POPUP_MS) {
  const [stored, dispatch] = useReducer(nextPhase, open ? "open" : ("closed" as Phase));
  const phase = nextPhase(stored, open ? "show" : "hide");
  useEffect(() => {
    if (phase !== stored) dispatch(open ? "show" : "hide");
  }, [phase, stored, open]);
  useEffect(() => {
    if (stored === "starting") {
      // Two frames: the first paints the starting style, the second lets it go.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => dispatch("frame"));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    if (stored === "ending") {
      const t = setTimeout(() => dispatch("exited"), exitMs);
      return () => clearTimeout(t);
    }
  }, [stored, exitMs]);
  return { mounted: phase !== "closed", attrs: presenceAttrs(phase) };
}
