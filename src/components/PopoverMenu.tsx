import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./popoverMenu.css";
import { placeMenu, type MenuPlacement, type Point } from "./popoverMenuPlacement";

// Conductor's right-click menu popup and items (renderApp-D_fmY7hW.js, read as
// data): popup `my` = "min-w-[8rem] rounded-lg ring-1 ring-popover-ring
// bg-popover p-1 shadow-md data-[starting-style]:opacity-0
// data-[starting-style]:scale-95 (same for ending) transition-[opacity,scale]
// duration-100 origin-[var(--transform-origin)]"; item `yu` = "flex items-center
// gap-2 rounded-md px-2 py-1.5 text-sm data-[highlighted]:bg-popover-accent
// [&_svg]:size-4 [&>svg]:text-muted-foreground". Measured live: 128 px wide,
// 4 px padding, 32 px items, 16 px muted icons.

export interface PopoverMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

interface Props {
  /** Pointer position of the right-click. */
  at: Point;
  /** Gap from the pointer (see popoverMenuPlacement.ts). */
  offset?: Point;
  items: readonly PopoverMenuItem[];
  label?: string;
  onClose: () => void;
}

const TRANSITION_MS = 100;
type Phase = "starting" | "open" | "ending";

export function PopoverMenu({ at, offset, items, label, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPlacement | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [highlight, setHighlight] = useState<number | null>(null);
  const closing = useRef(false);

  // An item runs its action at once (Conductor's `tWe` closes, then acts); the popup fades out over 100 ms.
  const close = useCallback((action?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    action?.();
    setPhase("ending");
    window.setTimeout(onClose, TRANSITION_MS);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(placeMenu(at, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, offset));
    el.focus();
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase((p) => (p === "starting" ? "open" : p))));
    return () => cancelAnimationFrame(raf);
    // Placed once, where the pointer was.
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onBlur = () => close();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [close]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h === null ? (step > 0 ? 0 : items.length - 1) : (h + step + items.length) % items.length));
    } else if ((e.key === "Enter" || e.key === " ") && highlight !== null) {
      e.preventDefault();
      const item = items[highlight];
      if (item) close(item.onSelect);
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="oc-popover-menu"
      data-starting-style={phase === "starting" ? "" : undefined}
      data-ending-style={phase === "ending" ? "" : undefined}
      style={pos ? { left: pos.left, top: pos.top, transformOrigin: `${pos.originX}px ${pos.originY}px` } : { left: -9999, top: -9999 }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          role="menuitem"
          tabIndex={-1}
          className="oc-popover-menu-item"
          data-highlighted={highlight === i ? "" : undefined}
          onPointerMove={() => setHighlight(i)}
          onPointerLeave={() => setHighlight(null)}
          onClick={() => close(item.onSelect)}
        >
          {item.icon}
          {item.label}
        </div>
      ))}
    </div>,
    document.body,
  );
}
