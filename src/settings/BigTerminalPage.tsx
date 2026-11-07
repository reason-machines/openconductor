import { executablePaths } from "./agentSettings";
import { ConductorIcon } from "../components/ConductorIcon";
import { TerminalPresetIcon } from "./TerminalPresetIcon";
import { useEffect, useState } from "react";
import type { Settings } from "./types";
import {
  afterDelete,
  bigTerminalCommand,
  customCommandsFrom,
  customPreset,
  PRESET_OPTIONS,
  presetFrom,
  type BigTerminalPreset,
  type CustomCommand,
} from "../features/terminal/bigTerminal.ts";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Conductor's "Big terminal" settings tab (shown while Big terminal mode is
 * on): the New tab preset, a radio list of agent presets with the command each
 * runs, then the user's custom commands, the selected one editable, and "Add
 * custom command" (evidence/terminal/NOTES.md).
 */
export function BigTerminalPage({ settings, save }: Props) {
  const preset = presetFrom(settings.terminal?.big_terminal_preset);
  const customCommands = customCommandsFrom(settings.terminal?.big_terminal_custom_commands);

  const write = (next: { preset: BigTerminalPreset; customCommands: CustomCommand[] }) =>
    save({ ...settings, terminal: { ...settings.terminal, big_terminal_preset: next.preset, big_terminal_custom_commands: next.customCommands } });

  const add = () => {
    const c = { id: crypto.randomUUID(), command: "" };
    write({ preset: customPreset(c.id), customCommands: [...customCommands, c] });
  };

  return (
    <div className="settings-big-terminal">
      <div className="settings-rows big-terminal">
        <div className="settings-row big-terminal-head">
          <div>
            <div className="settings-row-label">New tab preset</div>
            <div className="muted small">Command to auto-run when creating a new terminal tab.</div>
          </div>
        </div>
        <div role="radiogroup" aria-label="New tab preset" className="preset-list">
          {PRESET_OPTIONS.map((o) => {
            const command = bigTerminalCommand({
              preset: o.value,
              customCommands,
              requiresToolApprovals: settings.tool_approvals_enabled === true,
              executablePaths: executablePaths(settings),
            });
            return (
              <label key={o.value} className={`preset-option${preset === o.value ? " selected" : ""}`}>
                <input type="radio" name="big-terminal-preset" className="sr-only" value={o.value} checked={preset === o.value} onChange={() => write({ preset: o.value, customCommands })} />
                <span className="preset-icon"><TerminalPresetIcon preset={o.value} /></span>
                <span className="preset-label">{o.label}</span>
                {command && <span className="preset-command">{command}</span>}
              </label>
            );
          })}
          {customCommands.map((c) => (
            <CustomRow
              key={c.id}
              custom={c}
              selected={preset === customPreset(c.id)}
              onSelect={() => write({ preset: customPreset(c.id), customCommands })}
              onChange={(command) => write({ preset, customCommands: customCommands.map((x) => (x.id === c.id ? { ...x, command } : x)) })}
              onDelete={() => write(afterDelete({ preset, customCommands }, c.id))}
            />
          ))}
          <button type="button" className="preset-add" onClick={add}>
            <ConductorIcon name="plus" size={14} />
            Add custom command
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomRow(props: { custom: CustomCommand; selected: boolean; onSelect: () => void; onChange: (command: string) => void; onDelete: () => void }) {
  const { custom, selected } = props;
  const [text, setText] = useState(custom.command);
  useEffect(() => setText(custom.command), [custom.command]);
  const commit = () => {
    if (text !== custom.command) props.onChange(text);
  };
  return (
    <div className={`preset-option custom${selected ? " selected" : ""}`}>
      <label className="preset-custom-head">
        <input type="radio" name="big-terminal-preset" className="sr-only" value={customPreset(custom.id)} checked={selected} onChange={props.onSelect} />
        <span className="preset-icon"><ConductorIcon name="terminal" size={16} /></span>
        <span className="preset-command left">{custom.command || "No command set"}</span>
      </label>
      {selected && (
        <button type="button" className="term-icon" aria-label="Delete custom command" title="Delete custom command" onClick={props.onDelete}>
          <ConductorIcon name="trash-2" size={14} />
        </button>
      )}
      {selected && (
        <input
          type="text"
          aria-label="Custom command"
          className="preset-input"
          placeholder="my-agent --flag"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
    </div>
  );
}
