// Right-click on a link in chat markdown: Conductor's `EQ` (renderApp; `cEi` wraps
// every markdown link in it; read with REA as data). A web link offers one item,
// "Copy link address" (copy icon), which copies the href and toasts "Copied
// address to clipboard" (`n5`). File links Conductor resolves inside the workspace
// say "Copy file path" and add "Open in Finder"; OpenConductor's markdown draws
// inline-code paths as separate buttons, so only the web-link form exists here.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ContextMenu, MenuItem } from "../../components/menu/ContextMenu";
import { CopyIcon } from "../../components/menu/menuIcons";
import { copyText } from "../openIn/apps.ts";

type Notify = (kind: "info" | "error", message: string) => void;

/** Toasts for "Copy link address"; the transcript provides the workspace's. */
export const LinkMenuNotify = createContext<Notify | undefined>(undefined);

export const COPIED_LINK_ADDRESS = "Copied address to clipboard";
export const COPY_FAILED = "Failed to copy to clipboard";

export function LinkWithMenu({ href, onOpenLink, children }: { href?: string; onOpenLink?: (href: string) => void; children?: ReactNode }) {
  const notify = useContext(LinkMenuNotify);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setAt(null), []);
  return (
    <>
      <a
        href={href}
        className="md-link"
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => {
          if (!href || !onOpenLink) return;
          e.preventDefault();
          onOpenLink(href);
        }}
        onContextMenu={(e) => {
          if (!href) return;
          e.preventDefault();
          setAt({ x: e.clientX, y: e.clientY });
        }}
      >
        {children}
      </a>
      {at && href && (
        <ContextMenu at={at} label="Link actions" onClose={close}>
          <MenuItem
            icon={<CopyIcon />}
            onSelect={() =>
              void copyText(href).then(
                () => notify?.("info", COPIED_LINK_ADDRESS),
                () => notify?.("error", COPY_FAILED),
              )
            }
          >
            Copy link address
          </MenuItem>
        </ContextMenu>
      )}
    </>
  );
}
