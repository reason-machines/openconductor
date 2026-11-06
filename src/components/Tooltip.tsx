import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./tooltip.css";
import { SIDE_OFFSET, placeTooltip, type Placement, type Side } from "./tooltipPlacement";
export { titleWithShortcut } from "./tooltipPlacement";

// Conductor's tooltip, read with REA from renderApp-D_fmY7hW.js (Base UI
// Tooltip wrapped as `Jn` Root, `Xn` Trigger, `ni` Content; the app root
// mounts the provider `nci` with no delay):
//  - open delay 600 ms (`sRn=600`, the trigger default), close delay 0;
//  - provider group timeout 400 ms (`Xli`, timeout=400): while a tooltip is
//    open, or within 400 ms of one closing, the next opens with no delay;
//  - side "top", sideOffset 4, collisionPadding 8 (`ni` defaults), centred;
//  - a click on the trigger closes it (closeOnClick defaults to true);
//  - the shortcut follows the label as `Ss`, e.g. "Settings ⌘,".
export const TOOLTIP_DELAY_MS = 600;
export const TOOLTIP_GROUP_TIMEOUT_MS = 400;
const TRANSITION_MS = 100;


// Provider-wide instant phase (one provider at the app root, as Conductor).
let openCount = 0;
let lastClosedAt = -Infinity;
function instantPhase(now: number): boolean {
  return openCount > 0 || now - lastClosedAt < TOOLTIP_GROUP_TIMEOUT_MS;
}

interface Props {
  /** Label text, e.g. "Settings". */
  content: ReactNode;
  /** Shortcut glyphs shown after the label, e.g. "⌘,". Omit when the command has none. */
  shortcut?: string;
  side?: Side;
  sideOffset?: number;
  /** The trigger: one element that accepts pointer and focus handlers and a ref. */
  children: ReactElement;
  disabled?: boolean;
}

type Phase = "closed" | "starting" | "open" | "ending";

/** A Conductor-style tooltip around one trigger element. */
export function Tooltip({ content, shortcut, side = "top", sideOffset = SIDE_OFFSET, children, disabled }: Props) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("closed");
  const [pos, setPos] = useState<Placement | null>(null);
  const isOpen = phase === "starting" || phase === "open";

  const clear = () => { if (timer.current !== undefined) { window.clearTimeout(timer.current); timer.current = undefined; } };
  const show = useCallback(() => {
    if (disabled) return;
    clear();
    setPhase((p) => (p === "open" || p === "starting" ? p : "starting"));
  }, [disabled]);
  const hide = useCallback(() => {
    clear();
    setPhase((p) => (p === "closed" || p === "ending" ? p : "ending"));
  }, []);
  const scheduleShow = () => {
    clear();
    if (disabled) return;
    if (instantPhase(performance.now())) show();
    else timer.current = window.setTimeout(show, TOOLTIP_DELAY_MS);
  };

  useEffect(() => {
    if (!isOpen) return;
    openCount += 1;
    return () => { openCount -= 1; lastClosedAt = performance.now(); };
  }, [isOpen]);
  useEffect(() => () => clear(), []);
  useEffect(() => { if (disabled) hide(); }, [disabled, hide]);

  // Measure, place, then drop the starting style on the next frame so the 100 ms transition runs.
  useLayoutEffect(() => {
    if (phase !== "starting") return;
    const t = triggerRef.current;
    const tip = tipRef.current;
    if (!t || !tip) return;
    setPos(placeTooltip(t.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, side, sideOffset));
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase((p) => (p === "starting" ? "open" : p))));
    return () => cancelAnimationFrame(raf);
  }, [phase, side, sideOffset]);
  useEffect(() => {
    if (phase !== "ending") return;
    const t = window.setTimeout(() => setPhase((p) => (p === "ending" ? "closed" : p)), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [phase]);
  // Close on Escape and on scroll, as a floating tooltip does.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", hide, true); };
  }, [isOpen, hide]);

  const child = children as ReactElement<Record<string, unknown>>;
  const p = child.props;
  const chain = <E,>(own: ((e: E) => void) | undefined, mine: (e: E) => void) => (e: E) => { own?.(e); mine(e); };
  const trigger = cloneElement(child, {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el;
      const r = (child as unknown as { ref?: unknown }).ref;
      if (typeof r === "function") r(el);
      else if (r && typeof r === "object") (r as { current: unknown }).current = el;
    },
    onPointerEnter: chain(p.onPointerEnter as ((e: PointerEvent) => void) | undefined, (e: PointerEvent) => { if (e.pointerType !== "touch") scheduleShow(); }),
    onPointerLeave: chain(p.onPointerLeave as ((e: PointerEvent) => void) | undefined, () => hide()),
    onPointerDown: chain(p.onPointerDown as ((e: PointerEvent) => void) | undefined, () => hide()),
    onFocus: chain(p.onFocus as ((e: FocusEvent) => void) | undefined, (e: FocusEvent) => { if ((e.target as HTMLElement).matches?.(":focus-visible")) show(); }),
    onBlur: chain(p.onBlur as ((e: FocusEvent) => void) | undefined, () => hide()),
  });

  return (
    <>
      {trigger}
      {phase !== "closed" &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            data-slot="tooltip-content"
            data-side={pos?.side ?? side}
            className="oc-tooltip"
            data-starting-style={phase === "starting" ? "" : undefined}
            data-ending-style={phase === "ending" ? "" : undefined}
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          >
            {/* As Conductor's <p>{"Settings "}<Ss/></p>: label, a space, then the keys inline. */}
            <span>
              {content}
              {shortcut && (
                <>
                  {" "}
                  <span className="oc-tooltip-shortcut">
                    {[...shortcut].map((k, i) => <span key={`${k}-${i}`}>{k}</span>)}
                  </span>
                </>
              )}
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}
