// The terminal panel's run button at the right end of its tab row: Conductor 0.87.6's split
// button in `nro` (renderApp-D_fmY7hW.js ~7,147,000-7,149,700, read with REA as untrusted
// data). Idle: an outline xs button with the task's icon ("Run <label>" ⌘R; the label and
// shortcut show once the strip is 440 px wide, `wio`) and a chevron ("Select task") whose menu
// lists the tasks and Configure. While the task runs: one "Stop <label>" button with a filled
// square, or the working dots and "Starting..." / "Setting up..." / "Stopping...".
import { useRef, useState } from "react";
import { ChevronDownIcon, SettingsIcon } from "./Icons";
import { PopoverMenu } from "./PopoverMenu";
import { ShortcutHint, Tooltip } from "./ui/Tooltip";
import { RunIcon } from "../settings/rows/runIcons";
import type { RunHeader, RunTabTask } from "../scripts/runTab";
import "./runSplit.css";

interface Props {
  header: RunHeader;
  task: RunTabTask | null;
  tasks: readonly (RunTabTask & { icon?: string })[];
  icon?: string;
  disabled: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
  onConfigure: () => void;
}

export function RunSplitButton({ header, task, tasks, icon, disabled, onToggle, onPick, onConfigure }: Props) {
  const chevron = useRef<HTMLButtonElement>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  if (header.busy) {
    return (
      <div className="run-split">
        <Tooltip content={header.name} shortcut="workspace.toggleRun">
          <button type="button" className="run-split-main is-stop" aria-label={header.name} disabled={header.pending === "Stopping..."} onClick={onToggle}>
            {header.pending ? <WorkingDots /> : <StopIcon />}
            <span className="run-split-label">{header.pending ?? "Stop"}</span>
            {!header.pending && <ShortcutHint commandId="workspace.toggleRun" className="run-split-kbd" />}
          </button>
        </Tooltip>
      </div>
    );
  }
  const openMenu = () => {
    const r = chevron.current?.getBoundingClientRect();
    if (r) setMenuAt({ x: r.right - 128, y: r.bottom });
  };
  return (
    <div className="run-split">
      <Tooltip content={header.name} shortcut="workspace.toggleRun">
        <button type="button" className="run-split-main is-split" aria-label={header.name} disabled={disabled} onClick={onToggle}>
          <RunIcon name={task?.kind === "spotlight" ? "play" : (icon ?? "play")} size={12} />
          <span className="run-split-label">{header.label}</span>
          <ShortcutHint commandId="workspace.toggleRun" className="run-split-kbd" />
        </button>
      </Tooltip>
      <button
        ref={chevron}
        type="button"
        className="run-split-chevron"
        aria-label="Select task"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={openMenu}
      >
        <ChevronDownIcon size={12} />
      </button>
      {menuAt && (
        <PopoverMenu
          at={menuAt}
          offset={{ x: 0, y: 4 }}
          label="Select task"
          items={[
            ...tasks.map((t) => ({ label: t.label, icon: <RunIcon name={t.icon ?? "play"} size={16} />, onSelect: () => onPick(t.id) })),
            { label: "Configure", icon: <SettingsIcon size={16} />, onSelect: onConfigure },
          ]}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

/** Lucide square, filled (`GQe` with fill-current). */
function StopIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}

/** Conductor's working indicator (`ri type="working"`), 12 px. */
function WorkingDots() {
  return (
    <svg className="sb-ws-loader" width={12} height={12} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}
