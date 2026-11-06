// The active organization for React: the stored choice (Personal or a Reason
// workspace), the workspaces Reason lists, and a way to switch. One
// `listOrganizations` read is shared by every caller and kept for a minute.
import { useCallback, useEffect, useState } from "react";
import { loadOrganizations } from "./api";
import { ORGANIZATION_EVENT, reconcile, storeOrganization, storedOrganization, type Organization } from "./organization";

const FRESH_MS = 60_000;
let cached: { at: number; value: Organization[] | null } | null = null;
let inFlight: Promise<Organization[] | null> | null = null;

/** Reason's workspaces, or null when Reason can't be asked (signed out, no desktop app). */
function load(): Promise<Organization[] | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.value);
  inFlight ??= loadOrganizations()
    .catch((e: { code?: string }) => (e?.code === "authentication_required" || e?.code === "workspace_login_required" ? [] : null))
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export interface OrganizationState {
  /** The active Reason workspace, or null for Personal (this Mac). */
  active: Organization | null;
  /** Reason's workspaces; null until read or when Reason can't be asked. */
  organizations: Organization[] | null;
  select: (org: Organization | null) => void;
}

export function useOrganization(): OrganizationState {
  const [active, setActive] = useState<Organization | null>(storedOrganization);
  const [organizations, setOrganizations] = useState<Organization[] | null>(cached?.value ?? null);
  useEffect(() => {
    const onChange = (e: Event) => setActive((e as CustomEvent<Organization | null>).detail);
    window.addEventListener(ORGANIZATION_EVENT, onChange);
    let live = true;
    void load().then((orgs) => {
      if (!live) return;
      setOrganizations(orgs);
      const stored = storedOrganization();
      const next = reconcile(stored, orgs);
      if (JSON.stringify(next) !== JSON.stringify(stored)) storeOrganization(next);
    });
    return () => {
      live = false;
      window.removeEventListener(ORGANIZATION_EVENT, onChange);
    };
  }, []);
  const select = useCallback((org: Organization | null) => storeOrganization(org), []);
  return { active, organizations, select };
}
