// The active organization: Conductor's organization switcher, on Reason.
//
// Conductor 0.87.6 keeps a pointer to the active organization (`ukr`,
// `activeOrganizationPointer`, with the list cached in the keychain as
// `cached_organizations`); a cloud organization (`Qo`: `supportsLocal`
// false) turns Settings into its organization view (`I9a` `showOrganization`:
// Prompts, Environment, MCP and Cloud computer under Agents & environment, an
// Admin group with Preferences, Members and Billing) and opens
// /settings/organization/* (`lW`), which sends anyone else to General.
// REA-read from renderApp-D_fmY7hW.js on sven m5 max; evidence/org/NOTES.md.
//
// OpenConductor's organizations are Reason workspaces: the one the `reason`
// CLI is signed in to (`listOrganizations` lists only that one for a CLI login).
// "Personal" is this Mac, as before. The choice is kept in localStorage with the
// workspace's name and role, so a /settings/organization start URL resolves on
// the first render; `useOrganization` checks it against Reason afterwards.
// Pure apart from the storage helpers: organization.test.ts covers it.

/** A Reason workspace as `listOrganizations` returns it. */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  /** The caller's `membership_role`: owner, admin, member or viewer. */
  role: string;
}

/** What `listOrganizations` items look like (Reason API `Organization`). */
interface OrganizationItem {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  membership_role?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** `listOrganizations` → organizations, skipping entries without an id. */
export function parseOrganizations(data: unknown): Organization[] {
  const items = (data as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return (items as OrganizationItem[])
    .map((o) => ({ id: str(o.id), slug: str(o.slug), name: str(o.name) || str(o.slug), role: str(o.membership_role) }))
    .filter((o) => o.id !== "");
}

/** Whether the role may change the workspace's settings (Reason: owner or admin). */
export const canManage = (role: string): boolean => role === "owner" || role === "admin";

/** Conductor's `oH`: "org_admin" → "Org admin", "member" → "Member". */
export function roleLabel(role: string | null | undefined): string | undefined {
  if (!role) return undefined;
  const words = role.split(/[-_]/).join(" ");
  return words === "" ? undefined : words[0].toUpperCase() + words.slice(1);
}

/** A Reason workspace member (`listMembers` items). */
export interface Member {
  userId: string;
  email: string;
  role: string;
  avatarUrl?: string;
  /** Reason's members carry no names; the signed-in person's own comes from `getSelf`. */
  name?: string;
}

export function parseMembers(data: unknown, self?: { userId?: string; name?: string | null }): Member[] {
  const items = (data as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((m: Record<string, unknown>) => {
      const userId = str(m.user_id);
      const name = self?.userId && self.userId === userId ? self.name?.trim() || undefined : undefined;
      const avatarUrl = str(m.avatar_url) || undefined;
      return { userId, email: str(m.email), role: str(m.role), ...(avatarUrl ? { avatarUrl } : {}), ...(name ? { name } : {}) };
    })
    .filter((m) => m.userId !== "");
}

/** One row of Members (Conductor's `h0a`): name over email, or the email alone. */
export interface MemberRow {
  id: string;
  primary: string;
  secondary?: string;
  /** `u0a`: the first letters of the first two words of the name, else of the email. */
  initials: string;
  role?: string;
  avatarUrl?: string;
}

export function memberRow(m: Member): MemberRow {
  const name = m.name?.trim() || undefined;
  const initials = (name ?? m.email)
    .split(/\s+/)
    .filter((w) => w !== "")
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return {
    id: m.userId,
    primary: name ?? m.email,
    ...(name ? { secondary: m.email } : {}),
    initials,
    ...(roleLabel(m.role) ? { role: roleLabel(m.role) } : {}),
    ...(m.avatarUrl ? { avatarUrl: m.avatarUrl } : {}),
  };
}

// ---- MCP

/** An MCP server of the workspace (Reason API `McpServer`). */
export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: string;
  enabled: boolean;
  connectionState: string;
  url: string | null;
}

/** A service Reason connects through MCP (`listConnections` services with an `mcp` offering). */
export interface McpService {
  id: string;
  name: string;
  description: string;
  status: "connected" | "needs_attention" | "not_connected" | string;
}

/** What MCP › Installed lists: the workspace's own MCP servers, then connected services not among them. */
export function installedMcp(servers: McpServer[], services: McpService[]): McpServer[] {
  const names = new Set(servers.map((s) => s.name.toLowerCase()));
  const connected = services
    .filter((s) => s.status !== "not_connected" && !names.has(s.name.toLowerCase()))
    .map((s) => ({ id: `service:${s.id}`, name: s.name, description: s.description, transport: "", enabled: true, connectionState: s.status, url: null }));
  return [...servers, ...connected];
}

// ---- the stored choice -------------------------------------------------------

export const ACTIVE_ORGANIZATION_KEY = "openconductor.organization.v1";
/** Fired on window when the active organization changes. */
export const ORGANIZATION_EVENT = "openconductor:organization";

/** The active organization, or null for Personal (this Mac). */
export function storedOrganization(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): Organization | null {
  try {
    const raw = storage?.getItem(ACTIVE_ORGANIZATION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Organization>;
    return typeof o.id === "string" && o.id !== "" ? { id: o.id, slug: str(o.slug), name: str(o.name), role: str(o.role) } : null;
  } catch {
    return null;
  }
}

export function storeOrganization(org: Organization | null, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = globalThis.localStorage): void {
  try {
    if (org) storage?.setItem(ACTIVE_ORGANIZATION_KEY, JSON.stringify(org));
    else storage?.removeItem(ACTIVE_ORGANIZATION_KEY);
  } catch {
    // Storage full or unavailable: the choice lasts for this window only.
  }
  globalThis.dispatchEvent?.(new CustomEvent(ORGANIZATION_EVENT, { detail: org }));
}

/**
 * The stored organization checked against what Reason lists now: kept (with
 * its name and role refreshed) while Reason still lists it, dropped (Personal)
 * once it does not. `null` organizations means Reason could not be asked, so
 * the stored choice stands.
 */
export function reconcile(stored: Organization | null, organizations: Organization[] | null): Organization | null {
  if (!stored || organizations === null) return stored;
  return organizations.find((o) => o.id === stored.id) ?? null;
}
