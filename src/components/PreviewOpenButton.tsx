// The Run tab's Open button: Conductor's `Yve` (renderApp-D_fmY7hW.js ~6,927,549,
// REA string search, read as data). An outline xs button with a globe, "Open"
// and the localhost port in muted mono; its tooltip is "Open <url>" with the
// terminal.openLocalhost (⌘⇧B) hint. With more than one preview URL a chevron
// ("Choose preview URL") lists them, each with a globe and its label.
import { useRef, useState } from "react";
import { ChevronDownIcon, GlobeIcon } from "./Icons";
import { PopoverMenu } from "./PopoverMenu";
import { ShortcutHint, Tooltip } from "./ui/Tooltip";
import type { PreviewOption } from "../scripts/preview";
import "./previewOpen.css";

interface Props {
  options: readonly PreviewOption[];
  onOpen: (option: PreviewOption) => void;
}

export function PreviewOpenButton({ options, onOpen }: Props) {
  const chevron = useRef<HTMLButtonElement>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const first = options[0];
  if (!first) return null;
  const several = options.length > 1;
  const openMenu = () => {
    const r = chevron.current?.getBoundingClientRect();
    if (r) setMenuAt({ x: r.left, y: r.bottom });
  };
  return (
    <div className="preview-open" data-testid="preview-open">
      <Tooltip
        content={
          <div className="oc-tip-row">
            <span>{`Open ${first.resolvedUrl}`}</span>
            <ShortcutHint commandId="terminal.openLocalhost" />
          </div>
        }
      >
        <button
          type="button"
          className={`btn btn-small preview-open-main${several ? " split" : ""}`}
          aria-label={`Open ${first.resolvedUrl}`}
          onClick={() => onOpen(first)}
        >
          <GlobeIcon size={12} />
          <span className="preview-open-label">
            Open
            {first.displayPort && <span className="preview-open-port"> :{first.displayPort}</span>}
          </span>
        </button>
      </Tooltip>
      {several && (
        <button
          ref={chevron}
          type="button"
          className="btn btn-small preview-open-chevron"
          aria-label="Choose preview URL"
          aria-haspopup="menu"
          aria-expanded={menuAt !== null}
          onClick={openMenu}
        >
          <ChevronDownIcon size={12} />
        </button>
      )}
      {menuAt && (
        <PopoverMenu
          at={menuAt}
          offset={{ x: 0, y: 4 }}
          label="Preview URLs"
          items={options.map((o) => ({ label: o.label, icon: <GlobeIcon size={12} />, onSelect: () => onOpen(o) }))}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}
