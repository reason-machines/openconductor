// The "/" menu's agent part: the slash commands and skills a chat's agent
// offers in its folder, from the `agent_slash_commands` backend command
// (src-tauri/src/agent_commands), which answers per agent as Conductor's
// sidecar does (`getSlashCommandsResponse { slashCommands, skills }`,
// evidence/chat/slash-menu/README.md). One answer per agent and folder is
// kept for the app's run; the menu shows built-ins until it arrives.
//
// Codex runs a picked skill from a `{ type: "skill" }` input item: the
// composer inserts `$name`, and `linkCodexSkills` turns each known `$name`
// into `[$name](path)` on the way out, which the backend splits into the
// text and the item (codex_rpc.rs `skill_links`).

import { useEffect, useState } from "react";
import { invoke as coreInvoke, isTauri } from "@tauri-apps/api/core";
import type { ChatAgentId } from "./agentChoice.ts";

export interface AgentSlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface AgentSkill {
  name: string;
  description: string;
  /** SKILL.md on disk, or `reason-skill:<id>` for a Reason Workspace skill. */
  path: string;
  displayName?: string;
}

export interface AgentCommands {
  slashCommands: AgentSlashCommand[];
  skills: AgentSkill[];
  /** `agent`: the CLI answered; `scan`: its skill and command folders were read. */
  source: "agent" | "scan";
  error?: string;
}

type Invoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

const cache = new Map<string, AgentCommands>();
const inflight = new Map<string, Promise<AgentCommands>>();
const key = (agent: ChatAgentId, cwd: string) => `${agent}\u0000${cwd}`;

const tauriInvoke: Invoke = (cmd, args) => coreInvoke(cmd, args);

/** Asks the backend once per agent and folder; later calls get the same answer. */
export function fetchAgentCommands(agent: ChatAgentId, cwd: string, invoke: Invoke = tauriInvoke): Promise<AgentCommands> {
  const k = key(agent, cwd);
  const done = cache.get(k);
  if (done) return Promise.resolve(done);
  let p = inflight.get(k);
  if (!p) {
    p = (invoke("agent_slash_commands", { agentType: agent, cwd }) as Promise<AgentCommands>)
      .then((r) => {
        cache.set(k, r);
        return r;
      })
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

/** The answer already fetched for this agent and folder, if any. */
export function cachedAgentCommands(agent: ChatAgentId, cwd: string): AgentCommands | undefined {
  return cache.get(key(agent, cwd));
}

/** For tests. */
export function clearAgentCommandsCache(): void {
  cache.clear();
  inflight.clear();
}

/** The chat's agent commands and skills, or null until they arrive (and in the browser preview). */
export function useAgentCommands(agent: ChatAgentId, cwd: string | null | undefined): AgentCommands | null {
  const [value, setValue] = useState<AgentCommands | null>(() => (cwd ? cachedAgentCommands(agent, cwd) ?? null : null));
  useEffect(() => {
    if (!cwd || !isTauri()) return setValue(null);
    let live = true;
    setValue(cachedAgentCommands(agent, cwd) ?? null);
    fetchAgentCommands(agent, cwd)
      .then((r) => live && setValue(r))
      .catch(() => live && setValue(null));
    return () => {
      live = false;
    };
  }, [agent, cwd]);
  return value;
}

/**
 * `$name` for each known Codex skill becomes `[$name](path)`, which the
 * backend sends as the text `$name` plus a skill input item. A `$name` must
 * stand alone (start of text or after whitespace, then whitespace,
 * punctuation or the end); unknown names stay as typed.
 */
export function linkCodexSkills(text: string, skills: readonly AgentSkill[]): string {
  const byName = new Map<string, AgentSkill>();
  for (const s of skills) if (s.path.endsWith("SKILL.md") && !byName.has(s.name)) byName.set(s.name, s);
  if (byName.size === 0) return text;
  return text.replace(/(^|\s)\$([^\s$()[\]]+?)(?=$|\s|[.,!?;:])/g, (all, pre: string, name: string) => {
    const s = byName.get(name);
    return s ? `${pre}[$${name}](${s.path})` : all;
  });
}
