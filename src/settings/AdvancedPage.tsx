import { useEffect, useState } from "react";
import { Row } from "./GeneralPage";
import { RootPathRow } from "./RootPathRow";
import type { Settings } from "./types";
import { withTopLevel } from "./agentSettings";
import { scrollbackBytesFromMegabytes, scrollbackLimitBytes, scrollbackLimitMegabytes } from "../features/terminal/scrollback";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/** Executable override rows, in Conductor's order, with its copy. */
const EXECUTABLES = [
  { key: "claude_code_executable_path", label: "Claude Code", binary: "claude" },
  { key: "codex_executable_path", label: "Codex", binary: "codex" },
  { key: "opencode_executable_path", label: "OpenCode", binary: "opencode" },
] as const;

/**
 * Settings › More › Advanced: Conductor's root directory (RootPathRow), then
 * the Claude Code, Codex and OpenCode executable
 * paths and the SSH private key path (evidence/settings/NOTES.md, "Models
 * and providers"), then Scrollback limit (evidence/terminal/NOTES.md).
 * Conductor's remote execution and file-sync rows are not built.
 */
export function AdvancedPage({ settings, save }: Props) {
  return (
    <div className="settings-rows">
      <RootPathRow />
      {EXECUTABLES.map((e) => (
        <PathRow
          key={e.key}
          label={`${e.label} executable path`}
          help={`Override the bundled ${e.label} executable with a custom one. Leave empty to use the bundled version (recommended).`}
          placeholder={`/usr/local/bin/${e.binary}`}
          value={settings[e.key] ?? ""}
          onSave={(v) => save(withTopLevel(settings, e.key, v))}
        />
      ))}
      <PathRow
        label="SSH private key path"
        help="Use your own SSH key for cloud workspace access. Leave empty to auto-generate a key."
        placeholder="~/.ssh/id_ed25519"
        value={settings.ssh_key_path ?? ""}
        onSave={(v) => save(withTopLevel(settings, "ssh_key_path", v))}
      />
      <ScrollbackRow settings={settings} save={save} />
    </div>
  );
}

/** A path field saved on Enter or blur; blank clears the setting. */
function PathRow({ label, help, placeholder, value, onSave }: { label: string; help: string; placeholder: string; value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Row label={label} help={help}>
      <input
        type="text"
        aria-label={label}
        className="settings-text settings-path"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() !== value.trim()) onSave(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </Row>
  );
}

/**
 * Scrollback limit, in whole MB, saved as bytes on Enter or blur, and redrawn
 * with the value kept, as Conductor's is. Open terminals take a change at once
 * through applyAppearance.
 */
function ScrollbackRow({ settings, save }: Props) {
  const stored = settings.advanced?.terminal_scrollback_limit_bytes;
  const shown = String(scrollbackLimitMegabytes(stored));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const commit = () => {
    const bytes = scrollbackBytesFromMegabytes(text);
    setText(String(scrollbackLimitMegabytes(bytes)));
    if (bytes !== scrollbackLimitBytes(stored)) {
      save({ ...settings, advanced: { ...settings.advanced, terminal_scrollback_limit_bytes: bytes } });
    }
  };

  return (
    <Row label="Scrollback limit" help="Approximate terminal output to keep.">
      <span className="settings-inline">
        <input
          type="number"
          aria-label="Scrollback limit"
          min={1}
          step={1}
          className="settings-number"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="muted small">MB</span>
      </span>
    </Row>
  );
}
