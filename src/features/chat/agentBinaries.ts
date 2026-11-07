// Bundled agent binary download state for the chat (slice 5). Pure, so
// node --test covers it; agentBinaryStore.ts wires it to Tauri.
//
// Read from Conductor 0.87.6 (evidence/persistence/agent-binaries/README.md):
// - AgentBinaryStore (`lpe`, index-BGEQ8YjU.js @3050074) keys statuses by
//   `<agent>:<kind>` (`QV`), maps payloads with `XV`, listens on
//   `agent_binary_progress`, hydrates from `get_agent_binary_state`, then asks
//   `request_agent_binary_download` again for every `current` status that is
//   `failed`. It starts at app launch (renderApp `hRa`).
// - The chat banner shows for a local workspace whose agent is claude or codex
//   while that agent's status exists, is not `ready`, and no custom executable
//   path is set (`ido`); its text comes from `UAo` and `gSt`.

export type BinaryAgent = "claude" | "codex";
export type BinaryState = "pending" | "started" | "downloading" | "retrying" | "failed" | "ready";

/** One `agent_binary_progress` payload (`AgentBinaryStatus` in src-tauri/src/agent_binaries.rs). */
export interface AgentBinaryStatus {
  agent: BinaryAgent;
  kind: string;
  state: BinaryState;
  version: string;
  bytesDownloaded: number;
  bytesTotal?: number;
  error?: string;
  nextAttemptUnixMs?: number;
  attempt?: number;
}

export type Statuses = Readonly<Record<string, AgentBinaryStatus>>;

/** Conductor's `BAo` / `SAo`. */
export const BINARY_AGENT_NAMES: Record<BinaryAgent, string> = { claude: "Claude Code", codex: "Codex" };

export const statusKey = (agent: string, kind = "current") => `${agent}:${kind}`;

/** Conductor's `XV`: nulls become absent. */
export function toStatus(raw: AgentBinaryStatus | Record<string, unknown>): AgentBinaryStatus {
  const r = raw as Record<string, unknown>;
  const opt = <T>(v: unknown) => (v ?? undefined) as T | undefined;
  return {
    agent: r.agent as BinaryAgent,
    kind: r.kind as string,
    state: r.state as BinaryState,
    version: r.version as string,
    bytesDownloaded: r.bytesDownloaded as number,
    bytesTotal: opt<number>(r.bytesTotal),
    error: opt<string>(r.error),
    nextAttemptUnixMs: opt<number>(r.nextAttemptUnixMs),
    attempt: opt<number>(r.attempt),
  };
}

export function applyStatus(statuses: Statuses, status: AgentBinaryStatus): Statuses {
  return { ...statuses, [statusKey(status.agent, status.kind)]: status };
}

/** Agents whose current download failed: retried once the store has hydrated. */
export function failedAgents(statuses: Statuses): BinaryAgent[] {
  return Object.values(statuses)
    .filter((s) => s.kind === "current" && s.state === "failed")
    .map((s) => s.agent);
}

/** The chat agent whose bundled binary applies (Conductor's `rdo`): only Claude Code and Codex have one. */
export function binaryAgentFor(chatAgent: string): BinaryAgent | undefined {
  return chatAgent === "claude" || chatAgent === "codex" ? chatAgent : undefined;
}

/** Conductor's `qxr`: a set executable path is a non-blank string. */
const pathSet = (p: string | null | undefined) => typeof p === "string" && p.trim() !== "";

/** The status the banner shows, if any (Conductor's `ido`). */
export function bannerStatus(o: {
  agent: BinaryAgent | undefined;
  local: boolean;
  customPath: string | null | undefined;
  customPathLoading: boolean;
  status: AgentBinaryStatus | undefined;
}): AgentBinaryStatus | undefined {
  if (o.agent === undefined || !o.local || o.customPathLoading || pathSet(o.customPath)) return undefined;
  if (o.status === undefined || o.status.state === "ready") return undefined;
  return o.status;
}

/** Conductor's `gSt`. */
export const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;

/** Whole seconds left until `nextAttemptUnixMs` (Conductor's `$Ao`), never below 0. */
export const secondsLeft = (at: number, now: number) => Math.max(0, Math.ceil((at - now) / 1000));

export interface BannerModel {
  failed: boolean;
  /** Bold part. */
  title: string;
  /** Muted part after it (4px apart); the MB suffix carries a leading space, "Retrying…" does not, as in Conductor. */
  detail: string;
  /** Shown under "see error" (failed or retrying with an error). */
  error?: string;
  /** Button label: "Retry" when failed, "Retry now" while waiting to retry. */
  action?: "Retry" | "Retry now";
}

/** The banner's text (Conductor's `UAo`). */
export function bannerModel(s: AgentBinaryStatus, now: number): BannerModel {
  const name = BINARY_AGENT_NAMES[s.agent];
  const failed = s.state === "failed";
  const retrying = s.state === "retrying";
  const error = (failed || retrying) && s.error ? s.error : undefined;
  if (failed) return { failed, title: `Couldn't download ${name}.`, detail: "", error, action: "Retry" };
  const title = `Downloading ${name} ${s.version}…`;
  if (retrying) {
    const left = s.nextAttemptUnixMs !== undefined ? ` in ${secondsLeft(s.nextAttemptUnixMs, now)}s` : "";
    const attempt = s.attempt ? ` (attempt ${s.attempt})` : "";
    return { failed, title, detail: `Retrying${left}${attempt}`, error, action: "Retry now" };
  }
  const detail =
    s.bytesTotal && s.bytesTotal > 0
      ? ` ${megabytes(s.bytesDownloaded)} / ${megabytes(s.bytesTotal)}`
      : s.bytesDownloaded > 0
        ? ` ${megabytes(s.bytesDownloaded)}`
        : "";
  return { failed, title, detail, error };
}

/** What the store needs from the backend; agentBinaryStore.ts passes Tauri's. */
export interface BinaryBridge {
  listen(onStatus: (raw: unknown) => void): Promise<() => void>;
  getState(): Promise<unknown[]>;
  requestDownload(agent: BinaryAgent): Promise<void>;
}

export interface AgentBinaryStore {
  statuses(): Statuses;
  subscribe(onChange: () => void): () => void;
  /** Once: subscribe, hydrate, retry failed downloads. Later calls return the first run. */
  initialize(): Promise<void>;
  /** The user's Retry / Retry now. */
  retry(agent: BinaryAgent): Promise<void>;
  /** The agent's current status, for the banner and Settings' Version row. */
  getStatus(agent: BinaryAgent): AgentBinaryStatus | undefined;
}

export function createAgentBinaryStore(bridge: BinaryBridge, log: (msg: string, err: unknown) => void = () => undefined): AgentBinaryStore {
  let statuses: Statuses = {};
  let started: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const apply = (raw: unknown) => {
    if (!raw) return;
    statuses = applyStatus(statuses, toStatus(raw as Record<string, unknown>));
    for (const l of listeners) l();
  };
  const run = async () => {
    try {
      await bridge.listen(apply);
    } catch (e) {
      log("Failed to subscribe to agent_binary_progress:", e);
    }
    try {
      const beforeHydration = statuses;
      for (const raw of await bridge.getState()) {
        if (!raw) continue;
        const status = toStatus(raw as Record<string, unknown>);
        const key = statusKey(status.agent, status.kind);
        if (statuses[key] === beforeHydration[key]) apply(status);
      }
    } catch (e) {
      log("Failed to hydrate agent binary state:", e);
    }
    for (const agent of failedAgents(statuses)) {
      try {
        await bridge.requestDownload(agent);
      } catch (e) {
        log(`Failed to auto-retry download for ${agent}:`, e);
      }
    }
  };
  return {
    statuses: () => statuses,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    initialize: () => (started ??= run()),
    retry: (agent) => bridge.requestDownload(agent),
    getStatus: (agent) => statuses[statusKey(agent)],
  };
}
