import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import "./sidebarMotion.css";

// Sidebar list motion, after Conductor v0.87.6 (renderApp-D_fmY7hW.js, REA-extracted,
// read as data). Conductor wraps every sidebar list in framer-motion's AnimatePresence
// with `initial: false` (@9992099 Pinned, @10003180 sections, @10038911 repo groups) and
// each workspace row in `Qj` (@9894585), a motion.div with layout="position".

/** `{duration: .2, ease: "easeOut"}`: rows (`Qj`) and sections (`Yia`, @10000263). */
export const SIDEBAR_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;

/** A row that leaves (archived, moved to another group) collapses: Conductor's `sOt` (@9894186). */
const ROW_EXIT = { opacity: 0, height: 0, marginTop: 0, overflow: "hidden" } as const;
/** A new row rises 12px and fades in (`Qj`: `initial: {opacity: 0, y: 12}`). */
const ROW_ENTER = { opacity: 0, y: 12 } as const;
const ROW_REST = { opacity: 1, y: 0 } as const;
/** A deleted section collapses the same way: Conductor's `qia` (@9999212). */
const SECTION_EXIT = { opacity: 0, height: 0, marginTop: 0 } as const;

/** Rows that jump this many places restart instead of sliding (Conductor's `Fea`). */
const EPOCH_JUMP = 10;

/**
 * Conductor's `Bea`: a counter that bumps when the row's list index jumps by
 * 10 or more, so the row re-enters in place instead of sliding across the list.
 */
function useListEpoch(listIndex: number | undefined): number {
  const [s, set] = useState({ listIndex, epoch: 0 });
  if (s.listIndex !== listIndex) {
    const jump = s.listIndex !== undefined && listIndex !== undefined && Math.abs(listIndex - s.listIndex) >= EPOCH_JUMP;
    set({ listIndex, epoch: jump ? s.epoch + 1 : s.epoch });
    return jump ? s.epoch + 1 : s.epoch;
  }
  return s.epoch;
}

/**
 * A list whose rows animate in and out (framer-motion's AnimatePresence with
 * `initial: false`): rows on screen when the list mounts do not animate, rows
 * added later rise in, and removed rows collapse before they unmount.
 */
export function SidebarPresence({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

/**
 * The motion wrapper of one workspace row (Conductor's `Qj`). Without
 * `listIndex`, or with reduced motion on, the row renders bare, as in Conductor
 * (`E = listIndex !== undefined && !reduceMotion`).
 */
export function SidebarRowMotion({ listIndex, animateEntrance = true, children }: { listIndex: number | undefined; animateEntrance?: boolean; children: ReactNode }) {
  const reduce = useReducedMotion() === true;
  const epoch = useListEpoch(listIndex);
  if (listIndex === undefined || reduce) return <>{children}</>;
  return (
    <motion.div
      key={epoch}
      className="sb-ws-motion"
      layout="position"
      layoutDependency={listIndex}
      initial={animateEntrance ? ROW_ENTER : false}
      animate={ROW_REST}
      exit={ROW_EXIT}
      transition={SIDEBAR_TRANSITION}
    >
      {children}
    </motion.div>
  );
}

/**
 * A user section's root (Conductor's `Yia` motion.div): no entrance, a 200ms
 * collapse on delete (0s with reduced motion), and overflow clipped while it leaves.
 */
export function SidebarSectionMotion({ className, children, ...rest }: { className: string; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  const reduce = useReducedMotion() === true;
  // Conductor's `B0s` reads the presence context the same way (no exit hold of its own).
  const isPresent = useIsPresent();
  return (
    <motion.div
      {...rest}
      className={isPresent ? className : `${className} sb-motion-leaving`}
      exit={SECTION_EXIT}
      transition={{ ...SIDEBAR_TRANSITION, duration: reduce ? 0 : SIDEBAR_TRANSITION.duration }}
    >
      {children}
    </motion.div>
  );
}

/** Base UI popups in Conductor run `transition-[opacity,scale] duration-100` on open and close. */
export const POPUP_EXIT_MS = 100;

/**
 * Keeps a popup mounted for its 100ms close transition, as Base UI does with
 * `data-ending-style`: `mounted` stays true while `ending` is set, then drops.
 * `value` is the last open value, so a closing popup keeps its content and place.
 */
export function useMenuPresence<T>(value: T | null | undefined | false): { mounted: T | null; ending: boolean } {
  const open = value !== null && value !== undefined && value !== false;
  const [last, setLast] = useState<{ value: T | null; ending: boolean }>({ value: open ? value : null, ending: false });
  if (open && (last.value !== value || last.ending)) setLast({ value, ending: false });
  else if (!open && last.value !== null && !last.ending) setLast({ value: last.value, ending: true });
  useEffect(() => {
    if (!last.ending) return;
    const t = window.setTimeout(() => setLast({ value: null, ending: false }), POPUP_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [last]);
  if (open) return { mounted: value, ending: false };
  return { mounted: last.value, ending: last.value !== null };
}

/**
 * Attributes of a popup in its close transition: Base UI's `data-ending-style`, and out of
 * the accessibility tree and focus order (inert) so it no longer counts as an open menu.
 */
export function endingProps(ending: boolean): Record<string, string | boolean> {
  return ending ? { "data-ending-style": "", "aria-hidden": true, inert: "" } : {};
}
