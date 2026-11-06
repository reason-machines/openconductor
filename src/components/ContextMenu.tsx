// A right-click menu built the way Conductor's is. Conductor uses Base UI's
// ContextMenu (renderApp-D_fmY7hW.js: `kS` root, `A6` trigger, `gy` content,
// `L1` item, `aye` separator, `J4` shortcut, `TFt`/`AFt` submenu; read with
// REA as data, see parity/side-by-side/chat-diff-pr/context-menus/README.md).
// What this copies from it:
// - placement: the popup opens to the right of the pointer (side "right",
//   sideOffset 2, align "start") and flips or shifts to stay in the window;
//   submenus open beside their trigger (sideOffset 0);
// - motion: opacity and scale from 95% over 100 ms on open and on close,
//   scaling from the corner nearest the pointer;
// - highlight: the item under the pointer or keyboard focus gets
//   bg-popover-accent; nothing is highlighted when the menu opens;
// - keyboard: ArrowUp/ArrowDown (looping), Home/End, Enter/Space, ArrowRight
//   opens a submenu, ArrowLeft closes it, Escape closes the menu;
// - disabled items are dimmed to 50% and skipped.
// Styling lives in contextMenu.css.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./contextMenu.css";
import { placeMenu, type Point } from "./contextMenuPlacement.ts";

export type { Point };

/** Conductor's popup transition (`duration-100`). */
export const MENU_TRANSITION_MS = 100;
/** `gy`'s default sideOffset: the gap between the pointer and the popup. */
const SIDE_OFFSET = 2;

interface MenuCtx {
  /** Close the whole menu (with the closing animation). */
  close: () => void;
  /** data-cm-root value shared by the menu and its submenus. */
  rootId: string;
}

const Ctx = createContext<MenuCtx | null>(null);

function useMenu(): MenuCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ContextMenu items must be rendered inside <ContextMenu>");
  return ctx;
}

function items(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>(":scope > [role=menuitem]:not([data-disabled])")] : [];
}

/** Arrow/Home/End movement between a popup's enabled items. */
function moveFocus(popup: HTMLElement | null, key: string): boolean {
  const list = items(popup);
  if (list.length === 0) return false;
  const i = list.indexOf(document.activeElement as HTMLElement);
  let next: HTMLElement | undefined;
  if (key === "ArrowDown") next = list[(i + 1) % list.length];
  else if (key === "ArrowUp") next = list[i <= 0 ? list.length - 1 : i - 1];
  else if (key === "Home") next = list[0];
  else if (key === "End") next = list[list.length - 1];
  if (!next) return false;
  next.focus();
  return true;
}

/** `X7t`: while its menu is open, a row's number key (1-9) picks it. */
function pickNumber(popup: HTMLElement | null, key: string): boolean {
  if (!/^[1-9]$/.test(key)) return false;
  const row = popup?.querySelector<HTMLElement>(`:scope > [data-numkey="${key}"]:not([data-disabled])`);
  if (!row) return false;
  row.click();
  return true;
}

interface PopupProps {
  at: Point;
  sideOffset: number;
  label: string;
  sub?: boolean;
  className?: string;
  minWidth?: number;
  closing: boolean;
  rootId: string;
  popupRef: RefObject<HTMLDivElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

function Popup({ at, sideOffset, label, sub, className, minWidth, closing, rootId, popupRef, onKeyDown, children }: PopupProps) {
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const [starting, setStarting] = useState(true);

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // getBoundingClientRect includes the 95% starting scale; measure the layout size.
    const w = el.offsetWidth || r.width;
    const h = el.offsetHeight || r.height;
    const p = placeMenu(at, w, h, { width: window.innerWidth, height: window.innerHeight }, sideOffset);
    setPos({ left: p.left, top: p.top, origin: `${p.originY} ${p.originX}` });
  }, [at, sideOffset, popupRef]);

  useEffect(() => {
    if (!pos) return;
    const id = requestAnimationFrame(() => setStarting(false));
    return () => cancelAnimationFrame(id);
  }, [pos]);

  return createPortal(
    <div
      ref={popupRef}
      className={`cm${sub ? " cm-sub" : ""}${className ? ` ${className}` : ""}`}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      data-cm-root={rootId}
      data-starting-style={starting || undefined}
      data-ending-style={closing || undefined}
      style={{
        left: pos?.left ?? at.x,
        top: pos?.top ?? at.y,
        visibility: pos ? undefined : "hidden",
        minWidth,
        ["--cm-origin" as string]: pos?.origin,
        ["--cm-available-height" as string]: `${window.innerHeight}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onPointerLeave={(e) => {
        // Base UI drops the highlight when the pointer leaves the popup, unless a submenu is open.
        const popup = e.currentTarget;
        if (popup.contains(document.activeElement) && !popup.querySelector("[data-popup-open]")) popup.focus({ preventScroll: true });
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface ContextMenuProps {
  /** Pointer position of the right-click (viewport coordinates). */
  at: Point;
  /** Accessible name of the menu. */
  label: string;
  /** Called once the closing animation has finished; unmount the menu then. */
  onClose: () => void;
  /** Conductor sets min-w-[180px] / min-w-[200px] on some menus. */
  minWidth?: number;
  className?: string;
  children: ReactNode;
}

/** A right-click menu at `at`. Render it while open; it calls `onClose` when dismissed. */
export function ContextMenu({ at, label, onClose, minWidth, className, children }: ContextMenuProps) {
  const rootId = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => onCloseRef.current(), MENU_TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  // A new right-click while open moves the menu: reopen at the new point.
  useEffect(() => setClosing(false), [at]);

  useEffect(() => {
    popupRef.current?.focus({ preventScroll: true });
    const inside = (t: EventTarget | null) => t instanceof Element && t.closest(`[data-cm-root="${CSS.escape(rootId)}"]`) !== null;
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [close, rootId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches?.("[role=menuitem]")) return;
    if (moveFocus(popupRef.current, e.key) || pickNumber(popupRef.current, e.key)) e.preventDefault();
  };

  return (
    <Ctx.Provider value={{ close, rootId }}>
      <Popup at={at} sideOffset={SIDE_OFFSET} label={label} className={className} minWidth={minWidth} closing={closing} rootId={rootId} popupRef={popupRef} onKeyDown={onKeyDown}>
        {children}
      </Popup>
    </Ctx.Provider>
  );
}

function highlight(el: HTMLElement) {
  if (document.activeElement !== el) el.focus({ preventScroll: true });
}

export interface MenuItemProps {
  onSelect?: () => void;
  icon?: ReactNode;
  /** Right-aligned shortcut hint (`J4`), e.g. "⌘W". */
  shortcut?: ReactNode;
  /** Right-aligned number key of an "Open in" row (`X7t`). */
  numberKey?: number;
  disabled?: boolean;
  /** Conductor's `text-internal` colour (internal-only items). */
  internal?: boolean;
  /** Keep the menu open after selecting (Base UI closeOnClick=false). */
  keepOpen?: boolean;
  children: ReactNode;
}

export function MenuItem({ onSelect, icon, shortcut, numberKey, disabled, internal, keepOpen, children }: MenuItemProps) {
  const { close } = useMenu();
  const [hl, setHl] = useState(false);
  const select = () => {
    if (disabled) return;
    onSelect?.();
    if (!keepOpen) close();
  };
  return (
    <div
      role="menuitem"
      tabIndex={disabled ? undefined : -1}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      data-highlighted={hl || undefined}
      data-numkey={numberKey}
      className={`cm-item${internal ? " cm-internal" : ""}`}
      onFocus={() => setHl(true)}
      onBlur={() => setHl(false)}
      onPointerMove={(e) => !disabled && highlight(e.currentTarget)}
      onClick={select}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      }}
    >
      {icon}
      <span className="cm-label">{children}</span>
      {shortcut !== undefined && <span className="cm-shortcut">{shortcut}</span>}
      {numberKey !== undefined && <span className="cm-numkey">{numberKey}</span>}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="cm-sep" role="separator" />;
}

export interface SubMenuProps {
  label: ReactNode;
  icon?: ReactNode;
  /** Accessible name of the submenu popup. */
  menuLabel: string;
  disabled?: boolean;
  children: ReactNode;
}

/** A submenu row (`TFt`) and its popup (`AFt`), opened on hover, click or ArrowRight. */
export function SubMenu({ label, icon, menuLabel, disabled, children }: SubMenuProps) {
  const parent = useMenu();
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Point | null>(null);
  const [hl, setHl] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);

  const openSub = useCallback((focusFirst: boolean) => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // AFt aligns the popup's first item with the trigger: its top sits a border and the p-1 padding above.
    setOpen({ x: r.right, y: r.top - 5 });
    if (focusFirst) requestAnimationFrame(() => items(popupRef.current)[0]?.focus());
  }, []);

  // Another item of the parent menu taking the highlight closes this submenu.
  useEffect(() => {
    if (!open) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(null);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [open]);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  const onSubKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setOpen(null);
      triggerRef.current?.focus();
      return;
    }
    if (moveFocus(popupRef.current, e.key) || pickNumber(popupRef.current, e.key)) e.preventDefault();
  };

  return (
    <>
      <div
        ref={triggerRef}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        tabIndex={disabled ? undefined : -1}
        aria-disabled={disabled || undefined}
        data-disabled={disabled || undefined}
        data-highlighted={hl || undefined}
        data-popup-open={open ? "" : undefined}
        className="cm-item cm-subtrigger"
        onFocus={() => setHl(true)}
        onBlur={() => setHl(false)}
        onPointerMove={(e) => {
          if (disabled) return;
          highlight(e.currentTarget);
          if (!open) {
            window.clearTimeout(openTimer.current);
            openTimer.current = window.setTimeout(() => openSub(false), 50);
          }
        }}
        onPointerLeave={() => window.clearTimeout(openTimer.current)}
        onClick={() => !disabled && openSub(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openSub(true);
          }
        }}
      >
        {icon}
        <span className="cm-label">{label}</span>
        <ChevronRight />
      </div>
      {open && (
        <Ctx.Provider value={parent}>
          <Popup at={open} sideOffset={0} label={menuLabel} sub closing={false} rootId={parent.rootId} popupRef={popupRef} onKeyDown={onSubKeyDown}>
            {children}
          </Popup>
        </Ctx.Provider>
      )}
    </>
  );
}

// Icons in the shapes Conductor's menus use (lucide names in its bundle: eye,
// plus, arrow-up-right, copy, undo-2, hash, folder-open, download, clipboard,
// chevron-right), drawn here at 16px. Conductor's CSS sets every lucide icon to
// a 1px non-scaling stroke (`.lucide{stroke-width:1px}`, `vector-effect`), so these are too.
const svg = (size = 16) => ({ className: "cm-icon", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const ChevronRight = () => (<svg {...svg()} className="cm-icon cm-chevron"><path d="m9 18 6-6-6-6" /></svg>);
export const EyeMenuIcon = () => (<svg {...svg()}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const PlusMenuIcon = () => (<svg {...svg()}><path d="M5 12h14M12 5v14" /></svg>);
export const ArrowUpRightMenuIcon = () => (<svg {...svg()}><path d="M7 7h10v10M7 17 17 7" /></svg>);
export const CopyMenuIcon = () => (<svg {...svg()}><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>);
export const UndoMenuIcon = () => (<svg {...svg()}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>);
export const HashMenuIcon = () => (<svg {...svg()}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></svg>);
export const FolderOpenMenuIcon = () => (<svg {...svg()}><path d="m6 14 1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6a2 2 0 0 1-1.9 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" /></svg>);
export const DownloadMenuIcon = () => (<svg {...svg()}><path d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" /></svg>);
/** The ↵ glyph in "Fork to new tab"'s ⌘⌥↵ hint (Conductor's `gf`: size-3). */
export const EnterGlyph = () => (<svg {...svg(12)} role="img" aria-label="Enter"><path d="M20 4v7a4 4 0 0 1-4 4H4" /><path d="m9 10-5 5 5 5" /></svg>);
