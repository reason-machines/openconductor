import { useEffect, useState } from "react";
import { pickFolder } from "../backend";
import { scrollbackBytesFromMegabytes, scrollbackLimitBytes, scrollbackLimitMegabytes } from "../features/terminal/scrollback";
import { withTopLevel } from "./agentSettings";
import { PrefSwitchRow, Toggle } from "./controls";
import { Row } from "./GeneralPage";
import { FolderIcon } from "./icons";
import { RootPathRow } from "./RootPathRow";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/** Executable override rows, in Conductor's order, with its copy. */
const EXECUTABLES = [
  { key: "claude_code_executable_path", label: "Claude Code" },
  { key: "codex_executable_path", label: "Codex" },
] as const;

/**
 * Settings › More › Advanced, row for row with Conductor 0.87.6's `advanced`
 * tab (renderApp-D_fmY7hW.js registry, evidence/settings/NOTES.md "Settings
 * pages, row for row"): root directory, three executable paths, SSH private
 * key path, Remote execution MCP, Always allow local commands, Enable file
 * sync in new cloud workspaces, Set upstream on plain git push, Scrollback
 * limit.
 */
export function AdvancedPage({ settings, save }: Props) {
  const git = settings.git;
  return (
    <div className="settings-rows">
      <RootPathRow />
      {EXECUTABLES.map((e) => (
        <PathRow
          key={e.key}
          label={`${e.label} executable path`}
          help={`Override the bundled ${e.label} executable with a custom one. Leave empty to use the bundled version (recommended).`}
          value={settings[e.key] ?? ""}
          onSave={(v) => save(withTopLevel(settings, e.key, v))}
        />
      ))}
      <PathRow
        label="SSH private key path"
        help="Use your own SSH key for cloud workspace access. Leave empty to auto-generate a key."
        placeholder="~/.ssh/id_ed25519"
        browseTitle="Browse for SSH key"
        plain
        value={settings.ssh_key_path ?? ""}
        onSave={(v) => save(withTopLevel(settings, "ssh_key_path", v))}
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="internal_remote_local_execution_mcp"
        label="Remote execution MCP"
        help="Let remote agents request approved one-shot commands on this Mac. Each command still requires your approval."
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="always_allow_local_execution"
        label="Always allow local commands"
        help={
          <>
            Run local commands from remote agents without asking. Turned on when you choose <strong>Yes always</strong> on a local command approval.
          </>
        }
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="auto_sync_files_in_new_cloud_workspaces"
        label="Enable file sync in new cloud workspaces"
        help="Start syncing when you open a local terminal or run a local task. Sync files can still be turned on per workspace."
      />
      <Row
        label="Set upstream on plain git push"
        help={
          <>
            Configure new OpenConductor workspaces so plain <code>git push</code> sets a branch upstream. Turning this off avoids writing Git worktree config, but PR info may be less reliable until branches have an upstream.
          </>
        }
      >
        <Toggle
          label="Set upstream on plain git push"
          checked={git.worktree_push_auto_setup_remote}
          onChange={(on) => save({ ...settings, git: { ...git, worktree_push_auto_setup_remote: on } })}
        />
      </Row>
      <ScrollbackRow settings={settings} save={save} />
    </div>
  );
}

/**
 * A path field under its title (Conductor's executable-path rows `mGt` and SSH key row `npa`):
 * a mono 12 px input with a 24 px folder button titled "Browse for executable" (or "Browse for
 * SSH key") that picks a path; saved on Enter or blur, blank clears the setting. The SSH key row
 * is `plain`: Conductor draws it as a bare block, not a bordered settings row.
 */
function PathRow({
  label,
  help,
  placeholder,
  browseTitle = "Browse for executable",
  plain,
  value,
  onSave,
}: {
  label: string;
  help: string;
  placeholder?: string;
  browseTitle?: string;
  plain?: boolean;
  value: string;
  onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (next: string) => {
    if (next.trim() !== value.trim()) onSave(next);
  };
  const browse = async () => {
    const picked = await pickFolder(label);
    if (picked) {
      setText(picked);
      commit(picked);
    }
  };
  const field = (
    <span className="settings-field-wrap">
      <input
        type="text"
        aria-label={label}
        className="settings-field mono"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <button type="button" className="settings-field-icon" title={browseTitle} onClick={() => void browse()}>
          <FolderIcon size={14} />
        </button>
      </span>
  );
  if (plain)
    return (
      <div className="settings-row settings-plain-row" data-settings-row>
        <div>
          <div className="settings-plain-row-title settings-row-label">{label}</div>
          <div className="settings-plain-row-help">{help}</div>
        </div>
        {field}
      </div>
    );
  return (
    <Row label={label} help={help} stacked>
      {field}
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
          className="settings-field settings-number-field"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="settings-row-help">MB</span>
      </span>
    </Row>
  );
}
