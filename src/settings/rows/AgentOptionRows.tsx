import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { inTauri, openUrl } from "../../backend";
import { Row } from "../GeneralPage";
import { setAppPref, useAppPrefs } from "../appPrefs";
import { CODEX_PERSONALITIES, withAgentModel } from "../agentSettings";
import {
  CHROME_ROW,
  CONFIG_FILES,
  codexPersonality,
  executableCopy,
  storedExecutable,
  withExecutable,
  type OptionAgent,
} from "../agentOptions";
import type { CodexPersonality, Settings } from "../types";
import "./agentOptions.css";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/*
 * Per-agent options on Settings › Agents, after each tab's authentication
 * block, in Conductor 0.87.6's order (renderApp-D_fmY7hW.js; evidence in
 * evidence/settings/agent-options.md):
 *   Claude Code (`jpa` → `Rpa`): Use Claude Code with Chrome, Claude Code
 *     executable path, Claude settings card.
 *   Codex (`Fpa`): Codex personality for new chats, Codex executable path,
 *     Codex config card.
 * The Agents page shell (tabs, authentication, keys) is the other agent-settings builder's AgentsPage.tsx.
 */

export function ClaudeAgentOptions({ settings, save }: Props) {
  return (
    <>
      <ChromeModeRow />
      <ExecutablePathRow agent="claude" settings={settings} save={save} />
      <ConfigFileCard agent="claude" />
    </>
  );
}

export function CodexAgentOptions({ settings, save }: Props) {
  return (
    <>
      <Row label="Codex personality for new chats" help="Style to use when a new chat starts with a Codex model">
        <select
          aria-label="Codex personality for new chats"
          className="oc-agent-select-180"
          value={codexPersonality(settings)}
          onChange={(e) => save(withAgentModel(settings, "codex", "personality", e.target.value as CodexPersonality))}
        >
          {CODEX_PERSONALITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Row>
      <ExecutablePathRow agent="codex" settings={settings} save={save} />
      <ConfigFileCard agent="codex" />
    </>
  );
}

/** "Use Claude Code with Chrome" (`chrome_mode_enabled`, conductor.db's settings table). */
export function ChromeModeRow() {
  const checked = useAppPrefs().chrome_mode_enabled;
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="settings-row oc-agent-chrome">
      <div>
        <div className="settings-row-label">{CHROME_ROW.title}</div>
        <div className="muted small">
          Allow Claude Code to control your Chrome browser. To use this feature, first install the{" "}
          <LinkButton url={CHROME_ROW.extensionUrl}>Claude Code Chrome extension</LinkButton>. View{" "}
          <LinkButton url={CHROME_ROW.docsUrl}>the docs</LinkButton> to learn more.
        </div>
        {error && (
          <div className="error small" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="settings-row-control">
        <input
          type="checkbox"
          role="switch"
          aria-label={CHROME_ROW.title}
          checked={checked}
          onChange={(e) =>
            setAppPref({ key: "chrome_mode_enabled", value: e.target.checked }).then(
              () => setError(null),
              (err) => setError(String(err)),
            )
          }
        />
      </div>
    </div>
  );
}

function LinkButton({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button type="button" className="oc-agent-link" onClick={() => openUrl(url).catch(() => undefined)}>
      {children}
      <ExternalIcon />
    </button>
  );
}

/** The agent CLI on this system (`which <binary>` in Conductor); null when none or outside the app. */
function useSystemBinary(agent: OptionAgent): string | null {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    if (!inTauri()) return;
    let live = true;
    invoke<string | null>("agent_system_binary", { agent }).then(
      (p) => live && setPath(p),
      () => live && setPath(null),
    );
    return () => {
      live = false;
    };
  }, [agent]);
  return path;
}

/**
 * `mGt`: "<Agent> executable path". The field saves as you type, as
 * Conductor's does; blank means the default. Browse picks a file, the X
 * resets, and "Use system <Agent>" fills in the CLI found on this system
 * when nothing is set.
 */
export function ExecutablePathRow({ agent, settings, save }: Props & { agent: OptionAgent }) {
  const copy = executableCopy(agent);
  const saved = storedExecutable(settings, agent);
  const system = useSystemBinary(agent);
  // Local text, so a save that comes back normalised never moves the caret.
  const [text, setText] = useState(saved);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(saved);
  }, [saved]);

  const set = (value: string) => {
    setText(value);
    save(withExecutable(settings, agent, value));
  };
  const browse = async () => {
    if (!inTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, title: copy.browseTitle });
    if (typeof picked === "string" && picked) set(picked);
  };

  return (
    <div className="settings-row settings-row-stacked oc-agent-exec" data-agent={agent}>
      <div>
        <div className="settings-row-label">{copy.title}</div>
        <div className="muted small">{copy.description}</div>
      </div>
      <div className="oc-agent-exec-controls">
        <div className="oc-agent-exec-field">
          <input
            type="text"
            aria-label={copy.title}
            className="oc-agent-exec-input"
            placeholder={system ?? copy.fallbackPlaceholder}
            autoComplete="off"
            spellCheck={false}
            value={text}
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              setText(saved);
            }}
            onChange={(e) => set(e.target.value)}
          />
          <button type="button" className="oc-agent-icon-btn oc-agent-exec-browse" title="Browse for executable" aria-label="Browse for executable" onClick={() => browse().catch(() => undefined)}>
            <FolderIcon />
          </button>
        </div>
        {saved.trim() !== "" && (
          <button type="button" className="oc-agent-icon-btn" title={copy.reset} aria-label={copy.reset} onClick={() => set("")}>
            <XIcon />
          </button>
        )}
        {system !== null && saved.trim() === "" && (
          <button type="button" className="btn btn-small oc-agent-outline" title={system} onClick={() => set(system)}>
            {copy.useSystem}
          </button>
        )}
      </div>
      {saved.trim() !== "" && (
        <div className="oc-agent-warning" role="note">
          <WarningIcon />
          <p>{copy.warning}</p>
        </div>
      )}
    </div>
  );
}

/** `Nzi`: the agent's own settings file, opened in the default app (or its folder before it exists). */
function ConfigFileCard({ agent }: { agent: "claude" | "codex" }) {
  const card = CONFIG_FILES[agent];
  const [error, setError] = useState<string | null>(null);
  const openIt = () => {
    if (!inTauri()) return;
    invoke("open_agent_config", { agent }).then(
      () => setError(null),
      (e) => setError(String(e)),
    );
  };
  return (
    <section className="oc-agent-config" aria-label={card.title}>
      <div className="oc-agent-config-text">
        <h3>{card.title}</h3>
        <p className="oc-agent-config-path">{card.displayPath}</p>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="button" className="btn btn-small oc-agent-outline oc-agent-open-in" onClick={openIt}>
        Open in
      </button>
    </section>
  );
}

const svg = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function ExternalIcon() {
  return (
    <svg {...svg} className="oc-agent-ext" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg {...svg} width={14} height={14} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg {...svg} width={14} height={14} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function WarningIcon() {
  return (
    <svg {...svg} width={14} height={14} aria-hidden="true">
      <path d="m10.3 3.9-8.2 14A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-3.1l-8.2-14a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
    </svg>
  );
}
