// Conductor's tooltip, on the same library it uses (Base UI). From renderApp-D_fmY7hW.js:
//   Jn  (Tooltip root; delayDuration goes to the trigger through context)
//   Xn  (TooltipTrigger, asChild/render)
//   ni  (TooltipContent: Portal > Positioner z-50 > Popup, side top, sideOffset 4,
//        collisionPadding 8, no arrow, pr-1 when a <kbd> is a direct child else pr-2)
//   Ss  (keybinding hint for a commandId, following user overrides)
//   nci (TooltipProvider; the app root renders one with no delay)
// Evidence and the per-button inventory: parity/side-by-side/chat-diff-pr/tooltips/README.md.
import { Tooltip as Base } from "@base-ui/react/tooltip";
import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { CONTENT_DEFAULTS, hintParts, hintShortcuts, PROVIDER_TIMEOUT_MS } from "./tooltipModel.ts";
import "./tooltip.css";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

/** Conductor's root provider (`nci` with no delay): groups tooltips so neighbours open at once. */
export function TooltipProvider({ delay, children }: { delay?: number; children: ReactNode }) {
  return (
    <Base.Provider delay={delay} timeout={PROVIDER_TIMEOUT_MS}>
      {children}
    </Base.Provider>
  );
}

const CornerDownLeft = () => (
  <svg className="oc-tip-enter" role="img" aria-label="Enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    <path d="m9 10-5 5 5 5" />
  </svg>
);

/** `Ss`: the command's shortcut(s), "or" between alternatives; nothing when unbound. */
export function ShortcutHint({ commandId, className }: { commandId: string; className?: string }) {
  const { overrides } = useKeybindingOverrides();
  const shortcuts = hintShortcuts(commandId, overrides);
  if (shortcuts.length === 0) return null;
  return (
    <span className={className ? `oc-tip-hint ${className}` : "oc-tip-hint"}>
      {shortcuts.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="oc-tip-hint-or">or</span>}
          <span className="oc-tip-hint-keys">
            {hintParts(s).map((p, j) => (
              <span key={`${p}-${j}`}>{p === "enter" ? <CornerDownLeft /> : p}</span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export interface TooltipProps {
  /** What the tooltip says. A string or node; composed exactly as the Conductor call site does. */
  content: ReactNode;
  /** Registry command whose shortcut follows the content (`Ss`), as `[content, " ", Ss]`. */
  shortcut?: string;
  /** The trigger: one element that accepts a ref and props (a DOM element or a forwardRef component). */
  children: ReactElement;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  /** Jn's delayDuration for this site; omitted means the provider's (600 ms first, then instant). */
  delay?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** No tooltip at all (Conductor renders the bare trigger in these cases). */
  disabled?: boolean;
  /** Extra class on the popup (Conductor's `className` on `ni`). */
  className?: string;
}

const hasKbdChild = (node: ReactNode): boolean => Children.toArray(node).some((c) => isValidElement(c) && c.type === "kbd");

/**
 * A Conductor tooltip around one trigger:
 * `<Tooltip content="New chat, same files" shortcut="nav.newTab"><button …/></Tooltip>`.
 */
export function Tooltip({
  content,
  shortcut,
  children,
  side = CONTENT_DEFAULTS.side,
  align,
  sideOffset = CONTENT_DEFAULTS.sideOffset,
  alignOffset,
  collisionPadding = CONTENT_DEFAULTS.collisionPadding,
  delay,
  open,
  onOpenChange,
  disabled,
  className,
}: TooltipProps) {
  if (disabled) return children;
  // Conductor's usual site: `ni` children [label, " ", Ss]; the flex popup drops the space, so the
  // gap is Ss's pl-1. Sites that wrap label and hint in `span.flex.items-center.gap-1` (the chat tab
  // strip's +) pass that span as `content` (class oc-tip-row) and no `shortcut`.
  const body = shortcut ? (
    <>
      {content} <ShortcutHint commandId={shortcut} />
    </>
  ) : (
    content
  );
  const pad = hasKbdChild(body) ? "oc-tip-pr1" : "oc-tip-pr2";
  return (
    <Base.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      <Base.Trigger render={children} delay={delay} />
      <Base.Portal>
        <Base.Positioner className="oc-tip-positioner" side={side} align={align} sideOffset={sideOffset} alignOffset={alignOffset} collisionPadding={collisionPadding}>
          <Base.Popup data-slot="tooltip-content" className={`oc-tip ${pad}${className ? ` ${className}` : ""}`}>
            {body}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
