// Settings › Organization's calls: public Reason API operations through the
// desktop app's `reason_api_call` command (`reason call OPERATION`,
// src-tauri/src/reason_acp/api.rs, which refuses anything outside its list).
// The CLI signs in and pins the Workspace; OpenConductor never holds a
// Reason credential, and secret values go in on stdin and never come back.
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  SECRET_SCOPE,
  mcpServersFromReason,
  membersFromReason,
  pendingInvites,
  variablesFromSecrets,
  type EnvScope,
  type OrgMcpServer,
  type OrgMember,
  type OrgVariable,
} from "./orgModel.ts";

export interface ReasonCallError {
  code: string;
  message: string;
}

type Json = Record<string, unknown>;

async function call<T = Json>(operation: string, input: Json = {}): Promise<T> {
  // No isTauri() gate alone: the side-by-side harness answers IPC without making the whole app a desktop one.
  if (!isTauri() && !("__TAURI_INTERNALS__" in window)) {
    throw { code: "reason_unavailable", message: "Organization settings run in the OpenConductor desktop app." } satisfies ReasonCallError;
  }
  return invoke<T>("reason_api_call", { operation, input });
}

/** A failed call's words. */
export function callErrorText(e: unknown): string {
  if (e && typeof e === "object" && typeof (e as ReasonCallError).message === "string") return (e as ReasonCallError).message;
  return String(e);
}

/** The call needs a signed-in `reason` (Settings › Agents › Reason). */
export function needsReasonSignIn(e: unknown): boolean {
  const code = e && typeof e === "object" ? (e as ReasonCallError).code : "";
  return code === "authentication_required" || code === "workspace_login_required" || code === "reason_unavailable";
}

export async function loadMembers(): Promise<{ members: OrgMember[]; invites: string[] }> {
  const [list, self] = await Promise.all([call("listMembers"), call("getSelf").catch(() => ({}))]);
  return { members: membersFromReason(list, self), invites: pendingInvites(list) };
}

export async function loadVariables(scope: EnvScope): Promise<OrgVariable[]> {
  return variablesFromSecrets(await call("listSecrets", { query: { scope: SECRET_SCOPE[scope] } }));
}

export async function setVariable(scope: EnvScope, name: string, value: string): Promise<void> {
  await call("setSecret", { body: { name, value, scope: SECRET_SCOPE[scope] } });
}

export async function deleteVariable(scope: EnvScope, name: string): Promise<void> {
  await call("deleteSecret", { path: { secretId: name }, query: { scope: SECRET_SCOPE[scope] } });
}

export async function loadMcpServers(): Promise<OrgMcpServer[]> {
  return mcpServersFromReason(await call("listMcpServers"));
}

export async function addMcpServer(name: string, url: string): Promise<void> {
  await call("createMcpServer", { body: { name: name.trim(), transport: "http", url: url.trim() } });
}

export async function setMcpServerEnabled(id: string, enabled: boolean): Promise<void> {
  await call("updateMcpServer", { path: { id }, body: { enabled } });
}

export async function removeMcpServer(id: string): Promise<void> {
  await call("deleteMcpServer", { path: { id } });
}
