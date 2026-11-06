// What Settings › Organization shows, from the Reason workspace the `reason`
// CLI is signed in to. Conductor 0.87.6 reads its organization from its own
// cloud (index-BGEQ8YjU.js `listOrganizationMembers` → `W1e`, `listSecrets`-like
// `getOrganizationEnvironment` → `z4`, `listMcpServers` → `mPe`); OpenConductor
// reads the same facts from the Reason HTTP API (`reason call listMembers`,
// `listSecrets`, `listMcpServers`, evidence/reason-cloud/README.md). Pure, so
// the shapes are unit tested (orgModel.test.ts).

import { isOrgPage, type SettingsPage } from "../pages.ts";

type Json = Record<string, unknown>;

/**
 * Whether Settings shows the organization for `page`: an organization page
 * always does; elsewhere the switcher's choice counts once Reason is signed in.
 */
export function orgActive(page: SettingsPage | null, chosen: boolean, signedIn: boolean): boolean {
  return (page !== null && isOrgPage(page)) || (chosen && signedIn);
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const items = (v: unknown, key = "items"): Json[] => {
  const list = (v as Json | null)?.[key];
  return Array.isArray(list) ? (list.filter((x) => x && typeof x === "object") as Json[]) : [];
};

/** One row of Members (Conductor's `B1e`: id, email, name?, role?). */
export interface OrgMember {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

/**
 * `listMembers` (`items: [{user_id, email, role}]`) with the signed-in
 * person's name from `getSelf` (`user_id`, `user_name`): Reason gives
 * members no names, so only the person's own row has one. Conductor lists
 * members in the order its API returns them; so does this.
 */
export function membersFromReason(list: unknown, self: unknown): OrgMember[] {
  const me = self as Json | null;
  const myId = str(me?.user_id);
  const myName = str(me?.user_name);
  return items(list).flatMap((m) => {
    const id = str(m.user_id);
    const email = str(m.email);
    if (!id || !email) return [];
    const name = id === myId ? myName : str(m.name);
    return [{ id, email, ...(name ? { name } : {}), ...(str(m.role) ? { role: str(m.role) } : {}) }];
  });
}

/** Pending invitations (`listMembers.invites`, owners and admins only): their emails. */
export function pendingInvites(list: unknown): string[] {
  return items(list, "invites").flatMap((i) => (str(i.email) ? [str(i.email)!] : []));
}

/** Conductor's `u0a`: the first letters of the first two words of the name, else of the email. */
export function memberInitials(m: Pick<OrgMember, "name" | "email">): string {
  return (m.name ?? m.email)
    .split(/\s+/)
    .filter((w) => w !== "")
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Conductor's `d0a` → `oH`: "admin" → "Admin", "org_admin" → "Org admin"; none for a blank role. */
export function roleLabel(role: string | undefined): string | undefined {
  if (!role) return undefined;
  const words = role.split(/[-_]/).join(" ");
  return words === "" ? undefined : words[0].toUpperCase() + words.slice(1);
}

/** Environment's two tabs (Conductor's `o0a`): Personal and Shared. */
export type EnvScope = "personal" | "shared";

/** The `scope` Reason's secrets API takes for each tab. */
export const SECRET_SCOPE: Record<EnvScope, "user" | "organization"> = { personal: "user", shared: "organization" };

/** One variable on the Environment page: a Reason secret's name (values are write-only). */
export interface OrgVariable {
  name: string;
  updatedAt?: string;
}

/** `listSecrets` → `items: [{secret_id, name, scope, updated_at}]`, sorted by name. */
export function variablesFromSecrets(list: unknown): OrgVariable[] {
  return items(list)
    .flatMap((s) => {
      const name = str(s.name) ?? str(s.secret_id);
      return name ? [{ name, ...(str(s.updated_at) ? { updatedAt: str(s.updated_at) } : {}) }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** An environment variable name Reason stores as a secret: shell-safe, upper or lower case. */
export const isVariableName = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/**
 * Conductor's "Import .env": KEY=VALUE lines, `export ` allowed, quotes
 * stripped, comments and blanks skipped. Later lines win.
 */
export function parseDotenv(text: string): { name: string; value: string }[] {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out.set(m[1], value);
  }
  return [...out].map(([name, value]) => ({ name, value }));
}

/** One installed MCP server (Reason's `McpServer`). */
export interface OrgMcpServer {
  id: string;
  name: string;
  transport?: string;
  url?: string;
  enabled: boolean;
  state?: string;
  tools: number;
}

/** `listMcpServers` → `items`, by name. */
export function mcpServersFromReason(list: unknown): OrgMcpServer[] {
  return items(list)
    .flatMap((s) => {
      const id = str(s.id);
      const name = str(s.name);
      if (!id || !name) return [];
      return [
        {
          id,
          name,
          ...(str(s.transport) ? { transport: str(s.transport) } : {}),
          ...(str(s.url) ? { url: str(s.url) } : {}),
          enabled: s.enabled !== false,
          ...(str(s.connection_state) ? { state: str(s.connection_state) } : {}),
          tools: Array.isArray(s.tool_names) ? s.tool_names.length : 0,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Conductor's installed-MCP search: name or URL contains the query, ignoring case. */
export function filterMcpServers(servers: OrgMcpServer[], query: string): OrgMcpServer[] {
  const q = query.trim().toLowerCase();
  if (!q) return servers;
  return servers.filter((s) => s.name.toLowerCase().includes(q) || (s.url ?? "").toLowerCase().includes(q));
}

/** A server URL Reason can reach: http(s) with a host. */
export function isServerUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * Settings › Organization › Preferences, kept in OpenConductor's settings
 * file as `[organization]` (Reason's workspace settings API has no such
 * namespace): `pr_workspace_link`, Conductor's `prWorkspaceLinkEnabled`,
 * on unless set.
 */
export function prWorkspaceLinkEnabled(settings: object): boolean {
  const org = (settings as Json).organization as Json | undefined;
  return org?.pr_workspace_link !== false;
}

export function withPrWorkspaceLink<S extends object>(settings: S, on: boolean): S {
  const org = ((settings as Json).organization as Json | undefined) ?? {};
  return { ...settings, organization: { ...org, pr_workspace_link: on } };
}

/** `owner/name` of a GitHub remote URL (https or ssh), lower-cased; undefined for anything else. */
export function githubFullName(remote: string | undefined): string | undefined {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(remote?.trim() ?? "");
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : undefined;
}

/**
 * The organization's repositories in the settings nav. Conductor lists the
 * repositories on the organization's cloud computer (`A9a`, owner/name). A
 * Reason workspace reaches every repository its GitHub App can (hundreds,
 * for some), so the nav keeps the ones this Mac works on too: a local
 * repository whose GitHub remote, or else whose name, matches. `null` while
 * Reason has not answered.
 */
export function orgRepositories(reasonRepos: string[] | null | undefined, local: readonly { name: string; remote?: string }[]): string[] | null {
  if (!reasonRepos) return null;
  const byFull = new Map(reasonRepos.map((r) => [r.toLowerCase(), r]));
  const out = new Set<string>();
  for (const repo of local) {
    const full = githubFullName(repo.remote);
    const hit = full ? byFull.get(full) : reasonRepos.find((r) => r.split("/").pop()?.toLowerCase() === repo.name.toLowerCase());
    if (hit) out.add(hit);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}
