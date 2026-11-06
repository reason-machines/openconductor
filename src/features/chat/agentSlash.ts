// What a chat's agent offers in the composer's "/" menu: its own slash
// commands and skills, from `fetch_slash_commands` (src-tauri/src/slash_commands.rs,
// Conductor's `fetch_slash_commands_output`). One lookup per agent and folder,
// kept for a short while so switching tabs does not start the agent again.
// Outside the desktop app the agent offers nothing.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { AgentCommand, AgentSkill } from "./slashCommands.ts";

/** The agents `fetch_slash_commands` knows. */
export type SlashAgent = "claude" | "codex" | "reason";

export interface AgentSlash {
  slashCommands: AgentCommand[];
  skills: AgentSkill[];
  /** Why the agent could not be asked (not installed, not signed in). */
  error?: string;
}

const EMPTY: AgentSlash = { slashCommands: [], skills: [] };
/** A lookup is reused this long before the agent is asked again. */
const FRESH_MS = 30_000;
const cache = new Map<string, { at: number; value: Promise<AgentSlash> }>();

type Invoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

/** The agent's commands and skills for `cwd`; a failed lookup resolves with `error`. */
export function fetchAgentSlash(agent: SlashAgent, cwd: string, call: Invoke = invoke, now = Date.now()): Promise<AgentSlash> {
  const key = `${agent}\u0000${cwd}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < FRESH_MS) return hit.value;
  const value = call("fetch_slash_commands", { agentType: agent, cwd }).then(
    (out) => {
      const o = (out ?? {}) as Partial<AgentSlash>;
      return { slashCommands: o.slashCommands ?? [], skills: o.skills ?? [], ...(o.error ? { error: o.error } : {}) };
    },
    (e) => ({ ...EMPTY, error: String(e) }),
  );
  cache.set(key, { at: now, value });
  return value;
}

/** Forgets every lookup (tests). */
export function clearAgentSlash(): void {
  cache.clear();
}

/** The chat's agent commands and skills; empty until the lookup answers. */
export function useAgentSlash(agent: SlashAgent, cwd: string | null): AgentSlash {
  const [slash, setSlash] = useState<AgentSlash>(EMPTY);
  useEffect(() => {
    setSlash(EMPTY);
    if (!cwd || !isTauri()) return;
    let live = true;
    void fetchAgentSlash(agent, cwd).then((s) => {
      if (!live) return;
      if (s.error) console.warn(`slash commands (${agent}): ${s.error}`);
      setSlash(s);
    });
    return () => {
      live = false;
    };
  }, [agent, cwd]);
  return slash;
}
