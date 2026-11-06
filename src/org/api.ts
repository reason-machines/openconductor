// Settings › Organization's reads: public Reason API operations through the
// desktop app's `reason_api_call` (`reason call OPERATION`,
// src-tauri/src/reason_acp/api.rs, which allows only these reads besides
// Routines' Loop calls). The CLI signs in and pins the workspace; OpenConductor
// holds no Reason credential.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { parseMembers, parseOrganizations, type McpServer, type McpService, type Member, type Organization } from "./organization";

export type { McpServer, McpService };

export interface ApiError {
  code: string;
  message: string;
}

type Json = Record<string, unknown>;

async function call<T = Json>(operation: string, input: Json = {}): Promise<T> {
  // No isTauri() gate alone: the side-by-side harness answers IPC without making the whole app a desktop one.
  if (!isTauri() && !("__TAURI_INTERNALS__" in window))
    throw { code: "reason_unavailable", message: "Organizations come from Reason in the OpenConductor desktop app." } satisfies ApiError;
  return invoke<T>("reason_api_call", { operation, input });
}

/** A failed call's words. */
export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as ApiError).message === "string") return (e as ApiError).message;
  return String(e);
}

/** The Reason workspaces the signed-in CLI can act on. */
export const loadOrganizations = async (): Promise<Organization[]> => parseOrganizations(await call("listOrganizations"));

/** Members, with the signed-in person's own name (Reason's member list has none). */
export async function loadMembers(): Promise<Member[]> {
  const [members, self] = await Promise.all([call("listMembers"), call("getSelf").catch(() => ({}) as Json)]);
  return parseMembers(members, { userId: typeof self.user_id === "string" ? self.user_id : undefined, name: typeof self.user_name === "string" ? self.user_name : null });
}

export async function loadMcpServers(): Promise<McpServer[]> {
  const data = await call<{ items?: Json[] }>("listMcpServers");
  return (data.items ?? []).map((s) => ({
    id: String(s.id ?? ""),
    name: String(s.name ?? s.slug ?? ""),
    description: typeof s.description === "string" ? s.description : "",
    transport: typeof s.transport === "string" ? s.transport : "",
    enabled: s.enabled !== false,
    connectionState: typeof s.connection_state === "string" ? s.connection_state : "",
    url: typeof s.url === "string" ? s.url : null,
  }));
}

/** MCP-capable services: the connected ones are installed, the rest are Reason's catalog (Recommended). */
export async function loadMcpServices(): Promise<McpService[]> {
  const data = await call<{ services?: Json[] }>("listConnections");
  return (data.services ?? [])
    .filter((s) => Array.isArray(s.offerings) && (s.offerings as Json[]).some((o) => o.adapter === "mcp"))
    .map((s) => ({
      id: String(s.id ?? s.name ?? ""),
      name: String(s.name ?? ""),
      description: typeof s.description === "string" ? s.description : "",
      status: typeof s.status === "string" ? s.status : "not_connected",
    }))
    .filter((s) => s.name !== "");
}

/** A repository the workspace reaches; `enabled` when it is enabled for the workspace (`indexRepository`). */
export interface ReasonRepository {
  fullName: string;
  enabled: boolean;
}

export async function loadRepositories(): Promise<ReasonRepository[]> {
  const data = await call<{ items?: Json[] }>("listRepositories");
  return (data.items ?? [])
    .filter((r) => typeof r.full_name === "string" && r.archived !== true)
    .map((r) => ({ fullName: String(r.full_name), enabled: typeof r.id === "string" && r.id !== "" }));
}
