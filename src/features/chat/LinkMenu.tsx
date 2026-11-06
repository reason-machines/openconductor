// Right-click on a link in chat markdown: Conductor's `EQ` (renderApp, wrapped
// around links by `cEi`; read with REA as data). A web link offers one item,
// "Copy link address" (copy icon), which copies the href. File links Conductor
// resolves inside the workspace add "Open in Finder" and say "Copy file path";
// OpenConductor's markdown has no such href links yet (inline-code paths are
// separate buttons), so only the web-link form exists here.
import { useCallback, useState, type ReactNode } from "react";
import { ContextMenu, CopyMenuIcon, MenuItem, type Point } from "../../components/ContextMenu";
import { copyText } from "../openIn/apps.ts";

export function LinkWithMenu({ href, onOpenLink, children }: { href?: string; onOpenLink?: (href: string) => void; children?: ReactNode }) {
  const [at, setAt] = useState<Point | null>(null);
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
          <MenuItem icon={<CopyMenuIcon />} onSelect={() => void copyText(href).catch(() => undefined)}>
            Copy link address
          </MenuItem>
        </ContextMenu>
      )}
    </>
  );
}
