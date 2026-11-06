import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, CodeIcon, FolderIcon, TerminalIcon } from "../../components/Icons.tsx";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { PRIORITY } from "../../keybindings/dispatcher.ts";
import type { OpenInApp } from "./apps.ts";
import { cycleSwitcher, releasesOpenShortcut, switcherEntries, SWITCHER_DELAY_MS, type SwitcherSelection } from "./switcher.ts";
import "./appSwitcher.css";

interface Props {
  apps: readonly OpenInApp[];
  mru: readonly string[];
  onOpen: (appId: string) => void;
}

export function AppSwitcher({ apps, mru, onOpen }: Props) {
  const [selection, setSelection] = useState<SwitcherSelection | null>(null);
  const live = useRef(selection);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pointerReady = useRef(false);
  const { overrides } = useKeybindingOverrides();
  const update = (next: SwitcherSelection | null) => {
    live.current = next;
    setSelection(next);
  };
  const cancel = () => {
    clearTimeout(timer.current);
    pointerReady.current = false;
    update(null);
  };
  const choose = (index = live.current?.index) => {
    const entry = index === undefined ? undefined : live.current?.entries[index];
    cancel();
    if (entry?.kind === "app") onOpen(entry.app.id);
  };
  const actions = useRef({ cancel, choose, overrides });
  actions.current = { cancel, choose, overrides };

  useKeybindings({
    "workspace.openInApp": apps.length ? () => {
      if (live.current) {
        clearTimeout(timer.current);
        update(cycleSwitcher(live.current, 1));
      } else {
        pointerReady.current = false;
        update({ entries: switcherEntries(apps, mru, window.innerWidth), index: 0, visible: false });
        timer.current = setTimeout(() => {
          if (live.current) update({ ...live.current, visible: true });
        }, SWITCHER_DELAY_MS);
      }
    } : undefined,
    "workspace.openInMenu": () => {
      if (!live.current) return false;
      clearTimeout(timer.current);
      update(cycleSwitcher(live.current, -1));
    },
  }, PRIORITY.HIGH);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (!live.current) return;
      if (releasesOpenShortcut(effectiveShortcuts("workspace.openInApp", actions.current.overrides), event)) actions.current.choose();
      else if (event.key === "Escape") actions.current.cancel();
    };
    const onBlur = () => actions.current.cancel();
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!selection?.visible) return null;
  const selected = selection.entries[selection.index];
  const label = selected?.kind === "app" ? selected.app.name : "Close";
  return createPortal(
    <div className="oi-switcher" role="dialog" aria-label="Open in app" onMouseMove={() => { pointerReady.current = true; }}>
      <div className="oi-switcher-grid" style={{ gridTemplateColumns: `repeat(${selection.entries.length}, 110px)` }}>
        {selection.entries.map((entry, i) => {
          const active = i === selection.index;
          const name = entry.kind === "app" ? entry.app.name : "Close";
          const Glyph = entry.kind === "close" ? CloseIcon : entry.app.iconType === "folder" ? FolderIcon : entry.app.iconType === "terminal" ? TerminalIcon : CodeIcon;
          return (
            <div className="oi-switcher-cell" key={entry.kind === "app" ? entry.app.id : "close"} onMouseMove={() => {
              if (pointerReady.current && live.current && live.current.index !== i) update({ ...live.current, index: i });
            }}>
              {active && <span className={`oi-switcher-highlight${entry.kind === "close" ? " is-close" : ""}`} />}
              <button type="button" className="oi-switcher-button" aria-label={name} aria-pressed={active} onClick={() => choose(i)}>
                {entry.kind === "close" ? <span className="oi-switcher-close"><Glyph size={36} /></span> : entry.app.icon ? <img className="oi-switcher-icon" src={entry.app.icon} alt="" draggable={false} /> : <Glyph size={64} />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="oi-switcher-label" style={{ left: 24 + selection.index * 110 + 55 }}>{label}</div>
    </div>, document.body,
  );
}
