import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  canDragSection,
  canDragWorkspace,
  DRAG_THRESHOLD_PX,
  DROP_ATTR,
  insertionIndexAt,
  reorderTarget,
  workspaceDropTarget,
  type DropTarget,
  type NavSection,
} from "../state/navigationSections";

/** The row being dragged. */
export interface WorkspaceRef {
  repoId: string;
  id: string;
  pinned: boolean;
}

// Pointer drag of sidebar rows onto sections / Pinned / My workspaces, and of
// section headers to reorder them: Conductor's `esa` controller with its
// `vm` phase store (renderApp-D_fmY7hW.js @9936000-9939500 and
// @10091000-10096500, REA-decoded, read as data). A press becomes a drag
// after 5 px; the hit test is `elementFromPoint` + the drop-zone attributes;
// Escape, blur and pointercancel abort; the click that ends a drag is
// swallowed; near the list's top or bottom edge it scrolls 4-16 px a frame.

type Gesture = { kind: "workspace"; workspace: WorkspaceRef } | { kind: "section"; sectionId: string };

interface Press {
  gesture: Gesture;
  pointerId: number;
  startX: number;
  startY: number;
  source: HTMLElement;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
}

export type DragPhase = { type: "idle" } | { type: "pending"; press: Press } | { type: "dragging"; press: Press; target: DropTarget | undefined };

export interface SidebarDrag {
  /** What is being dragged and where it would drop, for highlights. */
  dragging: { gesture: Gesture; target: DropTarget | undefined } | undefined;
  workspacePointerDown: (e: ReactPointerEvent<HTMLElement>, workspace: WorkspaceRef) => void;
  sectionPointerDown: (e: ReactPointerEvent<HTMLElement>, sectionId: string) => void;
  /** The ghost that follows the pointer while dragging (portalled to <body>). */
  overlay: JSX.Element | null;
}

interface Options {
  sections: readonly NavSection[];
  /** Conductor turns the controller on once sections are loaded (`setEnabled`). */
  enabled: boolean;
  scrollRoot: RefObject<HTMLElement>;
  onDropWorkspace: (workspace: WorkspaceRef, target: DropTarget) => void;
  onDropSection: (sectionId: string, target: DropTarget) => void;
}

/** `Xra`: the drop zone under the pointer. */
function hitTest(x: number, y: number): DropTarget | undefined {
  const el = document.elementFromPoint(x, y)?.closest(`[${DROP_ATTR.section}], [${DROP_ATTR.sections}], [${DROP_ATTR.pinned}], [${DROP_ATTR.unsectioned}]`);
  if (!el) return undefined;
  const sectionId = el.getAttribute(DROP_ATTR.section);
  if (sectionId !== null) return { type: "section", sectionId };
  if (el.hasAttribute(DROP_ATTR.sections)) return undefined;
  if (el.hasAttribute(DROP_ATTR.pinned)) return { type: "pinned" };
  if (el.hasAttribute(DROP_ATTR.unsectioned)) return { type: "unsectioned" };
  return undefined;
}

/** `vJn`: pixels to scroll this frame when the pointer is past the list's top or bottom. */
function edgeScroll(x: number, y: number, root: HTMLElement): number {
  const r = root.getBoundingClientRect();
  if (x < r.left || x > r.right) return 0;
  const past = y < r.top ? y - r.top : y > r.bottom ? y - r.bottom : 0;
  if (past === 0) return 0;
  return Math.sign(past) * Math.min(16, Math.max(4, Math.abs(past)));
}

/** `yJn`: swallow the click the browser sends after the drag's pointerup. */
function swallowNextClick() {
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("pointerdown", done, true);
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("pointerdown", done, true);
}

export function useSidebarDrag({ sections, enabled, scrollRoot, onDropWorkspace, onDropSection }: Options): SidebarDrag {
  const [phase, setPhaseState] = useState<DragPhase>({ type: "idle" });
  const phaseRef = useRef(phase);
  const setPhase = useCallback((p: DragPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const ghost = useRef<HTMLDivElement | null>(null);
  const ghostAt = useRef<{ x: number; y: number } | undefined>(undefined);
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const latest = useRef({ sections, enabled, onDropWorkspace, onDropSection });
  latest.current = { sections, enabled, onDropWorkspace, onDropSection };

  const place = () => {
    const at = ghostAt.current;
    if (ghost.current && at) ghost.current.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
  };
  const ghostRef = (el: HTMLDivElement | null) => {
    ghost.current = el;
    const p = phaseRef.current;
    if (el && p.type === "dragging") {
      const copy = p.press.source.cloneNode(true) as HTMLElement;
      copy.removeAttribute("id");
      el.replaceChildren(copy);
    }
    place();
  };

  const begin = (e: ReactPointerEvent<HTMLElement>, gesture: Gesture) => {
    if (!latest.current.enabled || e.button !== 0 || e.ctrlKey || e.defaultPrevented) return;
    if (phaseRef.current.type === "dragging") return;
    const r = e.currentTarget.getBoundingClientRect();
    setPhase({
      type: "pending",
      press: { gesture, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, source: e.currentTarget, sourceLeft: r.left, sourceTop: r.top, sourceWidth: r.width },
    });
  };

  const workspacePointerDown = (e: ReactPointerEvent<HTMLElement>, workspace: WorkspaceRef) => begin(e, { kind: "workspace", workspace });
  const sectionPointerDown = (e: ReactPointerEvent<HTMLElement>, sectionId: string) => {
    // Only a press on the header button itself, not on a control inside it (`Cea`).
    if (e.target instanceof Element && e.target.closest("button") !== e.currentTarget) return;
    begin(e, { kind: "section", sectionId });
  };

  const active = phase.type !== "idle";
  useEffect(() => {
    if (!active) return;
    const stopScroll = () => {
      pointer.current = undefined;
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
    };
    const reset = () => {
      stopScroll();
      setPhase({ type: "idle" });
    };
    const targetAt = (press: Press, x: number, y: number): DropTarget | undefined => {
      const { sections } = latest.current;
      if (press.gesture.kind === "workspace") {
        const ws = press.gesture.workspace;
        return workspaceDropTarget(sections, ws.id, ws.pinned, hitTest(x, y));
      }
      const root = scrollRoot.current;
      if (!root) return undefined;
      const r = root.getBoundingClientRect();
      if (x < r.left || x > r.right) return undefined;
      const rects = new Map<string, DOMRect>();
      root.querySelectorAll<HTMLElement>(`[${DROP_ATTR.section}]`).forEach((el) => rects.set(el.getAttribute(DROP_ATTR.section)!, el.getBoundingClientRect()));
      return reorderTarget(sections, press.gesture.sectionId, insertionIndexAt(Math.min(Math.max(y, r.top), r.bottom), sections, rects));
    };
    const retarget = (x: number, y: number) => {
      const p = phaseRef.current;
      if (p.type !== "dragging") return;
      const target = targetAt(p.press, x, y);
      const same = JSON.stringify(target) === JSON.stringify(p.target);
      if (!same) setPhase({ ...p, target });
    };
    const scrollStep = () => {
      frame.current = undefined;
      const at = pointer.current;
      const root = scrollRoot.current;
      if (!at || !root) return;
      const dy = edgeScroll(at.x, at.y, root);
      if (dy === 0) return;
      const before = root.scrollTop;
      root.scrollBy({ top: dy });
      if (root.scrollTop !== before) {
        retarget(at.x, at.y);
        frame.current = requestAnimationFrame(scrollStep);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = phaseRef.current;
      if (p.type === "idle" || p.press.pointerId !== e.pointerId) return;
      const { press } = p;
      if (p.type === "pending") {
        if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD_PX) return;
        const { sections } = latest.current;
        const root = document;
        const ok =
          press.gesture.kind === "workspace"
            ? canDragWorkspace(sections, press.gesture.workspace.id, press.gesture.workspace.pinned, {
                pinned: root.querySelector(`[${DROP_ATTR.pinned}]`) !== null,
                unsectioned: root.querySelector(`[${DROP_ATTR.unsectioned}]`) !== null,
              })
            : canDragSection(sections, press.gesture.sectionId);
        if (!ok) return reset();
        setPhase({ type: "dragging", press, target: undefined });
      }
      ghostAt.current = { x: e.clientX - (press.startX - press.sourceLeft), y: e.clientY - (press.startY - press.sourceTop) };
      place();
      const root = scrollRoot.current;
      if (root && edgeScroll(e.clientX, e.clientY, root) !== 0) {
        pointer.current = { x: e.clientX, y: e.clientY };
        if (frame.current === undefined) frame.current = requestAnimationFrame(scrollStep);
      } else stopScroll();
      retarget(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      const p = phaseRef.current;
      if (p.type === "idle" || p.press.pointerId !== e.pointerId) return;
      if (p.type === "dragging") {
        swallowNextClick();
        const target = targetAt(p.press, e.clientX, e.clientY) ?? p.target;
        const { gesture } = p.press;
        if (target) {
          if (gesture.kind === "workspace") latest.current.onDropWorkspace(gesture.workspace, target);
          else latest.current.onDropSection(gesture.sectionId, target);
        }
      }
      reset();
    };
    const onCancel = (e: PointerEvent) => {
      const p = phaseRef.current;
      if (p.type !== "idle" && p.press.pointerId === e.pointerId) reset();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phaseRef.current.type === "dragging") {
        e.stopPropagation();
        swallowNextClick();
      }
      reset();
    };
    const noNativeDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", reset);
    window.addEventListener("dragstart", noNativeDrag, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", reset);
      window.removeEventListener("dragstart", noNativeDrag, true);
      stopScroll();
    };
  }, [active, scrollRoot, setPhase]);

  // Sections went away mid-drag (load error, reset): drop the gesture.
  useEffect(() => {
    if (!enabled && phaseRef.current.type !== "idle") setPhase({ type: "idle" });
  }, [enabled, setPhase]);

  const overlay =
    phase.type === "dragging"
      ? createPortal(
          <>
            <style>{"* { cursor: grabbing !important; } body { user-select: none; -webkit-user-select: none; } .repo-list a, .repo-list button { pointer-events: none; }"}</style>
            <div ref={ghostRef} className="sb-drag-ghost" style={{ width: phase.press.sourceWidth }} aria-hidden />
          </>,
          document.body,
        )
      : null;

  return {
    dragging: phase.type === "dragging" ? { gesture: phase.press.gesture, target: phase.target } : undefined,
    workspacePointerDown,
    sectionPointerDown,
    overlay,
  };
}
