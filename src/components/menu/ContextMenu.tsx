// Right-click menus, built to match Conductor's (renderApp-D_fmY7hW.js, REA-extracted
// and read as data): Base UI `ContextMenu.Root` (`wI`) with `Portal`/`Positioner`/`Popup`
// (`g2`/`b2`/`m2`) and the shared class strings
//   popup `my`  @737241: min-w-[8rem] rounded-lg ring-1 ring-popover-ring bg-popover p-1
//                        text-popover-foreground shadow-md, opacity/scale 95% for 100ms
//                        from origin var(--transform-origin)
//   item  `yu`  @737241: flex items-center gap-2 rounded-md px-2 py-1.5 text-sm,
//                        data-[highlighted] bg-popover-accent text-accent-foreground,
//                        data-[disabled] opacity-50, 16px icons, direct-child icons muted
//   separator `bJ`:      -mx-1 my-1 h-px bg-border
//   shortcut  `J4` @2245565 (ContextMenuShortcut): ml-auto pl-4 text-xs tracking-widest muted
// Placement is the Base UI positioner `b2` @712420: a context menu sits at the pointer with
// align start, alignOffset 2 and sideOffset -5, flips and shifts inside a 5px collision
// padding; a submenu (`PZ`/`PV`, hover delay 100ms) opens inline-end, align start.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon } from "./menuIcons";
import { placeDropdown, type Rect } from "./dropdownPlacement.ts";
import "./contextMenu.css";

const COLLISION_PADDING = 5;
const CLOSE_MS = 100;
const SUBMENU_DELAY_MS = 100;

interface Tree {
  id: string;
  close: () => void;
}
interface Level {
  /** Key of this level's open submenu. */
  openSub: string | null;
  setOpenSub: (key: string | null) => void;
  /** The submenu this level belongs to, so ArrowLeft can return to its trigger. */
  parentTrigger: HTMLElement | null;
}
const TreeContext = createContext<Tree | null>(null);
const LevelContext = createContext<Level | null>(null);

function items(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(":scope > [role^=menuitem]:not([data-disabled])")];
}

/** Arrow keys, Home/End, Enter/Space and ArrowRight/ArrowLeft for one menu panel. */
function onPanelKey(e: KeyboardEvent<HTMLDivElement>, level: Level) {
  const panel = e.currentTarget;
  const list = items(panel);
  const i = list.indexOf(document.activeElement as HTMLElement);
  const focus = (el: HTMLElement | undefined) => el?.focus({ preventScroll: true });
  // Keys stop here: a submenu is portalled but still bubbles through its parent menu in React.
  if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(e.key)) e.stopPropagation();
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      focus(list[i < 0 ? 0 : (i + 1) % list.length]);
      break;
    case "ArrowUp":
      e.preventDefault();
      focus(list[i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length]);
      break;
    case "Home":
      e.preventDefault();
      focus(list[0]);
      break;
    case "End":
      e.preventDefault();
      focus(list[list.length - 1]);
      break;
    case "Enter":
    case " ":
      if (i >= 0) {
        e.preventDefault();
        list[i].click();
      }
      break;
    case "ArrowLeft":
      if (level.parentTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const trigger = level.parentTrigger;
        trigger.dispatchEvent(new CustomEvent("cm-close-sub", { bubbles: false }));
        trigger.focus({ preventScroll: true });
      }
      break;
  }
}

type Phase = "starting" | "open" | "ending";

function useEnterPhase(): [Phase, (p: Phase) => void] {
  const [phase, setPhase] = useState<Phase>("starting");
  useEffect(() => {
    // One frame with data-starting-style, then transition to the open style.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase((p) => (p === "starting" ? "open" : p))));
    return () => cancelAnimationFrame(raf);
  }, []);
  return [phase, setPhase];
}

interface PanelProps {
  className?: string;
  label: string;
  style: React.CSSProperties;
  phase: Phase;
  level: Level;
  panelRef: React.RefObject<HTMLDivElement>;
  children: ReactNode;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

function Panel({ className, label, style, phase, level, panelRef, children, onKeyDown }: PanelProps) {
  const tree = useContext(TreeContext)!;
  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={`cm${className ? ` ${className}` : ""}`}
      data-cm-tree={tree.id}
      data-starting-style={phase === "starting" || undefined}
      data-ending-style={phase === "ending" || undefined}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented) onPanelKey(e, level);
      }}
    >
      <LevelContext.Provider value={level}>{children}</LevelContext.Provider>
    </div>
  );
}

/** Place a popup of size w×h; returns left/top after flip and shift inside the viewport. */
function place(w: number, h: number, a: { left: number; top: number; right: number; bottom: number }, mode: "context" | "submenu") {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = COLLISION_PADDING;
  let left: number;
  let top: number;
  if (mode === "context") {
    // side bottom, sideOffset -5, align start, alignOffset 2; flip to top when it does not fit.
    left = a.left + 2;
    top = a.bottom - 5;
    if (top + h > vh - pad && a.top + 5 - h >= pad) top = a.top + 5 - h;
  } else {
    // side inline-end, align start; flip to inline-start when it does not fit.
    left = a.right;
    top = a.top;
    if (left + w > vw - pad && a.left - w >= pad) left = a.left - w;
  }
  left = Math.max(pad, Math.min(left, vw - pad - w));
  top = Math.max(pad, Math.min(top, vh - pad - h));
  return { left, top };
}

interface ContextMenuProps {
  /** Viewport point of the right-click; a new point reopens the menu there. */
  at: { x: number; y: number };
  /**
   * A dropdown's trigger: the menu opens under it (align start, 4px gap,
   * dropdownPlacement.ts) instead of at the pointer. Use `DropdownMenu`.
   */
  anchor?: Rect;
  onClose: () => void;
  /** Accessible name of the menu. */
  label: string;
  /** Extra popup class, e.g. a min width (`min-w-[200px]` on the workspace menu). */
  className?: string;
  /** Keys handled before the menu's own navigation (the workspace menu's R and P). */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/** A right-click menu at `at`, portalled to <body>. */
export function ContextMenu({ at, anchor, onClose, label, className, onKeyDown, children }: ContextMenuProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useEnterPhase();
  const [pos, setPos] = useState<{ left: number; top: number; origin?: string } | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const closing = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    if (closing.current !== null) return;
    setOpenSub(null);
    setPhase("ending");
    closing.current = window.setTimeout(() => onCloseRef.current(), CLOSE_MS);
  }, [setPhase]);

  // A right-click elsewhere while open moves the menu: reset the close and the animation.
  useLayoutEffect(() => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = null;
    setOpenSub(null);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (anchor) {
      const p = placeDropdown(anchor, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight });
      setPos({ left: p.left, top: p.top, origin: `${p.originX}px ${p.originY}px` });
      return;
    }
    setPos(place(r.width, r.height, { left: at.x, right: at.x, top: at.y, bottom: at.y }, "context"));
    // `anchor` is read once per open, like the pointer.
  }, [at.x, at.y]);
  // Focus once placed: the measuring pass is `visibility: hidden`, which can't take focus,
  // and the menu needs it for arrow keys and the R / P accelerators.
  useLayoutEffect(() => {
    if (pos) ref.current?.focus({ preventScroll: true });
  }, [pos]);
  useEffect(() => () => {
    if (closing.current !== null) window.clearTimeout(closing.current);
  }, []);

  useEffect(() => {
    const outside = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest(`[data-cm-tree="${CSS.escape(id)}"]`)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [id, close]);

  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, ["--transform-origin" as string]: pos.origin ?? `${at.x - pos.left}px ${at.y - pos.top}px` }
    : { left: at.x, top: at.y, visibility: "hidden" };
  return createPortal(
    <TreeContext.Provider value={{ id, close }}>
      {/* Base UI's modal menu backdrop: the page under an open menu gets no hover, and a
          press outside only closes the menu. */}
      <div className="cm-backdrop" data-cm-tree={id} onPointerDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <Panel className={className} label={label} style={style} phase={pos ? phase : "starting"} level={{ openSub, setOpenSub, parentTrigger: null }} panelRef={ref} onKeyDown={onKeyDown}>
        {children}
      </Panel>
    </TreeContext.Provider>,
    document.body,
  );
}

/** A dropdown menu under its trigger (Conductor's DropdownMenu `h2` / `Tm`), portalled to <body>. */
export function DropdownMenu({ anchor, ...props }: Omit<ContextMenuProps, "at" | "anchor"> & { anchor: Rect }) {
  return <ContextMenu {...props} at={{ x: anchor.left, y: anchor.bottom }} anchor={anchor} />;
}

/** Closes submenus when the pointer moves onto another item of the same menu. */
function useSiblingHover(key: string | null) {
  const level = useContext(LevelContext);
  return () => {
    if (level && level.openSub !== null && level.openSub !== key) level.setOpenSub(null);
  };
}

interface ItemProps {
  icon?: ReactNode;
  children: ReactNode;
  /** Shortcut hint at the right (`ContextMenuShortcut`). */
  shortcut?: string;
  /** Content after the label, such as a check on the current choice. */
  trailing?: ReactNode;
  disabled?: boolean;
  /** Red item (`text-destructive … [&_svg]:!text-destructive`). */
  destructive?: boolean;
  /** Label takes the free width (`flex-1`), as in the status and section submenus. */
  grow?: boolean;
  checked?: boolean;
  /** Extra row class, e.g. `cm-app-row` for an Open in app (`X7t`). */
  className?: string;
  onSelect: () => void;
}

/** One menu row; selecting it runs `onSelect` and closes the whole menu. */
export function MenuItem({ icon, children, shortcut, trailing, disabled, destructive, grow, checked, className, onSelect }: ItemProps) {
  const tree = useContext(TreeContext)!;
  const siblingHover = useSiblingHover(null);
  return (
    <div
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={className ? `cm-item ${className}` : "cm-item"}
      data-disabled={disabled || undefined}
      data-destructive={destructive || undefined}
      onPointerMove={(e) => {
        siblingHover();
        if (!disabled && document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
      }}
      onPointerLeave={(e) => {
        if (document.activeElement === e.currentTarget) (e.currentTarget.parentElement as HTMLElement | null)?.focus({ preventScroll: true });
      }}
      onClick={() => {
        if (disabled) return;
        onSelect();
        tree.close();
      }}
    >
      {icon}
      {grow ? <span className="cm-grow">{children}</span> : children}
      {trailing}
      {shortcut && <span className="cm-shortcut">{shortcut}</span>}
    </div>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="cm-sep" />;
}

interface SubMenuProps {
  icon?: ReactNode;
  label: string;
  /** Popup class of the submenu, e.g. `cm-w-44` (Set status) or `cm-min-w-44` (Move to section). */
  className?: string;
  children: ReactNode;
}

/** A row that opens a submenu on hover (after 100ms), click or ArrowRight. */
export function SubMenu({ icon, label, className, children }: SubMenuProps) {
  const level = useContext(LevelContext)!;
  const key = useId();
  const open = level.openSub === key;
  const triggerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const siblingHover = useSiblingHover(key);
  const focusFirst = useRef(false);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    const el = triggerRef.current;
    const onClose = () => level.setOpenSub(null);
    el?.addEventListener("cm-close-sub", onClose);
    return () => el?.removeEventListener("cm-close-sub", onClose);
  }, [level]);
  const show = (withFocus: boolean) => {
    focusFirst.current = withFocus;
    level.setOpenSub(key);
  };
  return (
    <>
      <div
        ref={triggerRef}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={-1}
        className="cm-item"
        data-popup-open={open || undefined}
        onPointerMove={(e) => {
          siblingHover();
          if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
          if (!open && timer.current === null) {
            timer.current = window.setTimeout(() => {
              timer.current = null;
              show(false);
            }, SUBMENU_DELAY_MS);
          }
        }}
        onPointerLeave={() => {
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = null;
        }}
        onClick={() => show(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            show(true);
          }
        }}
      >
        {icon}
        {label}
        <ChevronRightIcon className="cm-chevron" />
      </div>
      {open && triggerRef.current && (
        <SubPanel trigger={triggerRef.current} label={label} className={className} focusFirst={focusFirst.current}>
          {children}
        </SubPanel>
      )}
    </>
  );
}

function SubPanel({ trigger, label, className, focusFirst, children }: { trigger: HTMLElement; label: string; className?: string; focusFirst: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase] = useEnterPhase();
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = trigger.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const p = place(r.width, r.height, a, "submenu");
    setPos({ ...p, origin: `${p.left >= a.right - 1 ? 0 : r.width}px ${a.top - p.top}px` });
  }, [trigger]);
  // As in ContextMenu: focus only once visible (the measuring pass is `visibility: hidden`).
  useLayoutEffect(() => {
    if (pos && focusFirst && ref.current) items(ref.current)[0]?.focus({ preventScroll: true });
  }, [pos, focusFirst]);
  const style: React.CSSProperties = pos ? { left: pos.left, top: pos.top, ["--transform-origin" as string]: pos.origin } : { left: 0, top: 0, visibility: "hidden" };
  return createPortal(
    <Panel className={className} label={label} style={style} phase={pos ? phase : "starting"} level={{ openSub, setOpenSub, parentTrigger: trigger }} panelRef={ref}>
      {children}
    </Panel>,
    document.body,
  );
}
