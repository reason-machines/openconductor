// Mount/unmount phases for a popup that animates in and out the way
// Conductor's Base UI popups do: the element renders once with
// data-starting-style (opacity 0, scale .95), loses it on the next frame so the
// CSS transition runs to the open style, and on close gets data-ending-style
// and stays mounted until the exit transition has had time to finish.
// Same attribute names as Base UI, so the CSS in motion.css also fits Base UI
// Popup elements (src/components/ui/Tooltip.tsx uses them).

export type Phase = "closed" | "starting" | "open" | "ending";

export type PresenceEvent = "show" | "hide" | "frame" | "exited";

/** Next phase. "frame": a frame was painted; "exited": the exit duration elapsed. */
export function nextPhase(phase: Phase, event: PresenceEvent): Phase {
  switch (event) {
    case "show":
      return phase === "open" || phase === "starting" ? phase : phase === "ending" ? "open" : "starting";
    case "hide":
      return phase === "closed" ? "closed" : "ending";
    case "frame":
      return phase === "starting" ? "open" : phase;
    case "exited":
      return phase === "ending" ? "closed" : phase;
  }
}

/** The attributes the element carries in a phase (undefined drops the attribute in React). */
export function presenceAttrs(phase: Phase): { "data-starting-style"?: ""; "data-ending-style"?: "" } {
  if (phase === "starting") return { "data-starting-style": "" };
  if (phase === "ending") return { "data-ending-style": "" };
  return {};
}

/** Exit duration in ms, mirroring --oc-motion-popup in motion.css. */
export const POPUP_MS = 100;
