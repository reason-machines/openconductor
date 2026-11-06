import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { openUrl } from "../backend";
import { COMMANDS } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";
import { BookIcon, ExternalIcon, HelpIcon, KeyboardIcon, MessageIcon } from "./Icons";
import { Tooltip } from "./Tooltip";
import { HELP_ITEMS, nextIndex, versionLine, type HelpIcon as HelpIconName, type HelpItem } from "./helpMenuItems";
import { endingProps, useMenuPresence } from "./sidebarMotion";

function shortcut(commandId: string): string {
  const c = COMMANDS.find((cmd) => cmd.id === commandId);
  return c ? glyphs(c.key) : "";
}

const ICONS: Record<HelpIconName, JSX.Element> = {
  keyboard: <KeyboardIcon size={16} />,
  book: <BookIcon size={16} />,
  message: <MessageIcon size={16} />,
};

/**
 * Footer help button and its menu (Conductor's footer help popover): opens above the button,
 * aligned to its left edge, 4px away; 340px wide; arrow keys move between items; Escape or a
 * click outside closes it.
 */
export function HelpMenu({ appVersion, onOpenShortcuts }: { appVersion?: string; onOpenShortcuts: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const next = nextIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.key);
    if (next === -1) return;
    e.preventDefault();
    items[next].focus();
  };

  const popup = useMenuPresence(open);
  const select = (item: HelpItem) => {
    setOpen(false);
    if (item.action.kind === "shortcuts") onOpenShortcuts();
    else void openUrl(item.action.url);
  };

  return (
    <div ref={ref} className="sb-help">
      {/* Conductor's help trigger: Tooltip "Help" (no shortcut), closed while the menu is open. */}
      <Tooltip content="Help" disabled={open}>
        <button
          ref={triggerRef}
          type="button"
          className="sb-footer-btn"
          aria-label="Help"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <HelpIcon size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      {popup.mounted && (
        <div ref={menuRef} className="sb-help-menu" role="menu" aria-label="Help" onKeyDown={onMenuKey} {...endingProps(popup.ending)}>
          {HELP_ITEMS.map((item) => {
            const keys = item.commandId ? shortcut(item.commandId) : "";
            return (
              <button key={item.label} type="button" role="menuitem" className="sb-help-item" onClick={() => select(item)}>
                <span className="sb-help-item-main">
                  {item.icon ? <span className="sb-help-icon">{ICONS[item.icon]}</span> : <span className="sb-help-icon" aria-hidden />}
                  <span>{item.label}</span>
                  {item.external && <span className="sb-help-external"><ExternalIcon size={12} /></span>}
                </span>
                {keys && <kbd className="sb-help-kbd">{keys}</kbd>}
              </button>
            );
          })}
          <div className="sb-help-version">{versionLine(appVersion)}</div>
        </div>
      )}
    </div>
  );
}
