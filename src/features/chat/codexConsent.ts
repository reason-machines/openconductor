// Codex requests that wait on the user for something other than a tool
// approval: an MCP server asking for information (elicitation) and Codex
// asking for extra sandbox permissions. The backend holds them
// (`src-tauri/src/agent/codex_consent.rs`) and sends a `consent` payload.
//
// Conductor 0.87.6 (REA reads of its index and renderApp chunks, recorded in
// `evidence/chat-status/codex-consent.md`) sets the session to
// `needs_user_input` while one waits and back to `working` once it is
// answered. Its card says "<server> needs information" (form, structured
// JSON or an authorization page, then Cancel / Continue) or "<server>
// requests permission" (what is asked, then Deny / Approve).
//
// Pure: no Tauri, no React, so `codexConsent.test.ts` covers it.

import type { SessionStatus } from "./queue.ts";

export interface CodexConsent {
  type: "consent";
  requestId: number | string;
  kind: "elicitation" | "permissions";
  turnId: string | null;
  /** The MCP server's name, or "codex" for a permission request. */
  serverName: string;
  message: string | null;
  mode: "form" | "openai/form" | "url" | null;
  requestedSchema: unknown;
  url: string | null;
  reason: string | null;
  cwd: string | null;
  /** Codex's `permissions` (`network`, `fileSystem`), sent back as is on Approve. */
  permissions: unknown;
}

/** What a card answers (the backend's `ConsentAnswer`). */
export type ConsentAnswer =
  | { action: "accept"; content?: Record<string, unknown> }
  | { action: "decline" }
  | { action: "cancel" }
  | { action: "grant"; grantedPermissions: unknown; scope: "turn" | "session" };

/**
 * The chat's status once its open requests change. Conductor keeps one
 * status per session: a tool approval is `needs_user_permission`, an open
 * consent `needs_user_input`, and answering the last one goes back to
 * `working`. Permission outranks input (`tTr`). Only a running turn moves:
 * idle, error and cancelling stay as they are.
 */
export function statusWithOpenRequests(status: SessionStatus, approvals: number, consents: number): SessionStatus {
  if (status !== "working" && status !== "needs_user_permission" && status !== "needs_user_input") return status;
  if (approvals > 0) return "needs_user_permission";
  if (consents > 0) return "needs_user_input";
  return "working";
}

// ----- Elicitation forms ------------------------------------------------

export type FieldType = "string" | "number" | "integer" | "boolean" | "enum";

export interface FormField {
  name: string;
  type: FieldType;
  label: string;
  description: string | null;
  required: boolean;
  /** For `enum`: the values to send and what to show for each. */
  options: { value: string; label: string }[];
}

export type FormValue = string | boolean;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The fields of a `form` elicitation's schema (MCP's flat object schema). */
export function formFields(schema: unknown): FormField[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : []);
  return Object.entries(schema.properties).flatMap(([name, prop]): FormField[] => {
    if (!isRecord(prop)) return [];
    const base = { name, label: str(prop.title) ?? name, description: str(prop.description), required: required.has(name) };
    if (Array.isArray(prop.enum)) {
      const names = Array.isArray(prop.enumNames) ? prop.enumNames : [];
      const options = prop.enum.filter((v): v is string => typeof v === "string").map((value, i) => ({ value, label: str(names[i]) ?? value }));
      return [{ ...base, type: "enum", options }];
    }
    if (Array.isArray(prop.oneOf)) {
      const options = prop.oneOf.flatMap((o) => (isRecord(o) && typeof o.const === "string" ? [{ value: o.const, label: str(o.title) ?? o.const }] : []));
      return [{ ...base, type: "enum", options }];
    }
    if (prop.type === "string" || prop.type === "number" || prop.type === "integer" || prop.type === "boolean") return [{ ...base, type: prop.type, options: [] }];
    return [];
  });
}

/** Starting values: each field's `default`, else empty (booleans false). */
export function initialValues(schema: unknown): Record<string, FormValue> {
  const props = isRecord(schema) && isRecord(schema.properties) ? schema.properties : {};
  const values: Record<string, FormValue> = {};
  for (const f of formFields(schema)) {
    const d = isRecord(props[f.name]) ? (props[f.name] as Record<string, unknown>).default : undefined;
    if (f.type === "boolean") values[f.name] = d === true;
    else values[f.name] = d === undefined || d === null ? "" : String(d);
  }
  return values;
}

/** The content to accept with, or the first problem to show. Empty optional fields are left out. */
export function formContent(fields: readonly FormField[], values: Record<string, FormValue>): { content: Record<string, unknown> } | { error: string } {
  const content: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === "boolean") {
      content[f.name] = v === true;
      continue;
    }
    const text = typeof v === "string" ? v.trim() : "";
    if (!text) {
      if (f.required) return { error: `${f.label} is required.` };
      continue;
    }
    if (f.type === "number" || f.type === "integer") {
      const n = Number(text);
      if (!Number.isFinite(n) || (f.type === "integer" && !Number.isInteger(n))) return { error: `${f.label} must be ${f.type === "integer" ? "a whole number" : "a number"}.` };
      content[f.name] = n;
    } else content[f.name] = text;
  }
  return { content };
}

/** An `openai/form` answer typed as JSON (Conductor's own messages). */
export function structuredContent(text: string): { content: Record<string, unknown> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "Enter valid JSON." };
  }
  if (!isRecord(parsed)) return { error: "Structured response must be a JSON object." };
  return { content: parsed };
}

// ----- Permission requests ----------------------------------------------

function entryPath(p: unknown): string {
  if (typeof p === "string") return p;
  if (isRecord(p)) return str(p.path) ?? str(p.pattern) ?? str(p.value) ?? JSON.stringify(p);
  return String(p);
}

/** One line per thing asked for, worded like Conductor's card (`s1o`). */
export function permissionLines(permissions: unknown): string[] {
  if (!isRecord(permissions)) return [];
  const lines: string[] = [];
  if (isRecord(permissions.network) && permissions.network.enabled === true) lines.push("Network access");
  const fs = isRecord(permissions.fileSystem) ? permissions.fileSystem : isRecord(permissions.filesystem) ? permissions.filesystem : null;
  if (fs) {
    for (const p of Array.isArray(fs.read) ? fs.read : []) lines.push(`Read ${entryPath(p)}`);
    for (const p of Array.isArray(fs.write) ? fs.write : []) lines.push(`Write ${entryPath(p)}`);
    for (const e of Array.isArray(fs.entries) ? fs.entries : []) {
      if (!isRecord(e)) continue;
      const verb = e.access === "deny" ? "Deny" : e.access === "write" ? "Write" : "Read";
      lines.push(`${verb} ${entryPath(e.path)}`);
    }
  }
  return lines;
}
