import { useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { MoreIcon } from "./Icons";
import "./sidebarActionsMenu.css";

export interface SidebarMenuAction {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
}

export interface SidebarActionsMenuProps {
  label: string;
  items: readonly (SidebarMenuAction | "-")[];
  className: string;
  contextOpen?: boolean;
}

export function SidebarActionsMenu({ label, items, className, contextOpen }: SidebarActionsMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <div className={`sb-menu-anchor ${className}`} data-open={open || contextOpen || undefined}>
        <Menu.Trigger className="sb-menu-trigger" aria-label={`${label} actions`} onClick={(e) => e.stopPropagation()}>
          <MoreIcon size={14} />
        </Menu.Trigger>
      </div>
      <Menu.Portal>
        <Menu.Positioner className="sb-actions-positioner" side="bottom" align="end" sideOffset={4} collisionPadding={5}>
          <Menu.Popup className="sb-actions-popup" aria-label={`${label} actions`}>
            {items.map((item, i) => item === "-" ? (
              <Menu.Separator key={`sep-${i}`} className="sb-actions-separator" />
            ) : (
              <Menu.Item key={item.label} className="sb-actions-item" disabled={item.disabled} data-destructive={item.destructive || undefined} onClick={item.onSelect}>
                {item.icon}
                <span>{item.label}</span>
                {item.shortcut && <span className="sb-actions-shortcut">{item.shortcut}</span>}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
