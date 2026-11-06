// Mount/unmount phases for a popup or toast that animates in and out the way
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

/** Exit durations in ms, mirroring the --oc-motion-* tokens in motion.css. */
export const POPUP_MS = 100;
export const TOAST_MS = 400;

/**
 * Ids of toasts that have played their entry. App.tsx renders a separate
 * Toaster for the Settings view, so opening or closing Settings remounts every
 * live toast; a toast slides in once, when it is first shown, not on each remount
 * (a replayed slide-in covered the controls under the toaster, #545).
 */
export function entryOnce<K>(played: Set<K>) {
  return {
    /** Whether `key` still has its entry to play. Read during render: no side effect. */
    pending: (key: K) => !played.has(key),
    /** Record that `key` has entered (call from an effect). */
    played: (key: K) => void played.add(key),
  };
}

/**
 * The list a toaster renders: the current items in order, plus items removed
 * since the last render kept at their old place with `leaving: true` so they
 * can animate out. Items already leaving stay until `drop` removes them.
 */
export function keepLeaving<T>(shown: readonly { item: T; leaving: boolean }[], next: readonly T[], key: (t: T) => string | number): { item: T; leaving: boolean }[] {
  const nextKeys = new Map(next.map((t) => [key(t), t]));
  const out: { item: T; leaving: boolean }[] = [];
  const placed = new Set<string | number>();
  for (const s of shown) {
    const k = key(s.item);
    const current = nextKeys.get(k);
    if (current !== undefined) {
      out.push({ item: current, leaving: false });
      placed.add(k);
    } else out.push({ item: s.item, leaving: true });
  }
  for (const t of next) if (!placed.has(key(t))) out.push({ item: t, leaving: false });
  return out;
}
