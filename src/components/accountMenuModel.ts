// The sidebar's Account menu model (the top row: avatar, "<name>'s Mac",
// chevron). Ported from Conductor 0.87.6's decoded renderApp-D_fmY7hW.js:
// `iEi` @6,090,883, `Q$t`, `YTt` @6,091,025, `Jzs` @6,091,307 (presentation)
// and `zna` @9,957,506 (menu). See evidence/sidebar-resource-usage/NOTES.md.
//
// Conductor's row is an organization switcher for its cloud account: the
// personal organization reads "<name>'s Mac", other organizations their own
// names. OpenConductor's organizations are the personal one (the local user,
// `local_account`) and the Reason workspace the `reason` CLI is signed in to
// (src/org/organization.ts). Pure: unit tested in accountMenuModel.test.ts.

/** What `local_account` returns. */
export interface LocalAccount {
  name: string;
  email: string | null;
}

/** `iEi`: "<name>'s Mac", or "My Mac" with no name. */
export function computerLabel(name: string): string {
  return name !== "" ? `${name}'s Mac` : "My Mac";
}

/** `YTt` for a personal organization: the avatar's image or initial. */
export interface PersonIcon {
  fallbackInitial?: string;
  imageUrl?: string;
  imageAlt: string;
}

export function personIcon(name: string, avatarUrl = ""): PersonIcon {
  return {
    fallbackInitial: name !== "" ? name.charAt(0).toUpperCase() : undefined,
    imageUrl: avatarUrl !== "" ? avatarUrl : undefined,
    imageAlt: name,
  };
}

/** One organization in the switcher; `id` null is the personal one (this Mac). */
export interface OrganizationChoice {
  id: string | null;
  label: string;
  /** Conductor's `isCloud` mark: a Reason workspace. */
  cloud: boolean;
  selected: boolean;
}

/** One entry of the open menu, in order. */
export type AccountMenuEntry =
  | { kind: "email"; email: string }
  | { kind: "separator" }
  | { kind: "organization"; organization: OrganizationChoice }
  | { kind: "item"; id: "settings"; label: string };

export interface AccountMenuModel {
  triggerLabel: string;
  triggerIcon: PersonIcon;
  /** The trigger shows Conductor's building icon instead of the avatar (an organization is active). */
  triggerOrganization: boolean;
  entries: AccountMenuEntry[];
}

/** A Reason workspace the switcher can offer. */
export interface OrganizationOption {
  id: string;
  name: string;
}

/**
 * `Jzs` + `zna`: the email heading, then (with more than one organization)
 * the organization list, then Settings. The list is the personal
 * organization ("<name>'s Mac") and each Reason workspace, the active one
 * checked; Conductor marks cloud organizations with a cloud. The trigger
 * names the active organization. "Create organization" / "Upgrade to Pro"
 * appear only when Conductor's cloud account offers them, so neither does
 * here. Its last entry, "Log out", ends the Conductor cloud session; signing
 * out of Reason is Settings › Account's, so it is left out here.
 */
export function accountMenuModel(account: LocalAccount, organizations: readonly OrganizationOption[] = [], activeId: string | null = null): AccountMenuModel {
  const entries: AccountMenuEntry[] = [];
  if (account.email) entries.push({ kind: "email", email: account.email }, { kind: "separator" });
  const active = organizations.find((o) => o.id === activeId);
  if (organizations.length > 0) {
    const choices: OrganizationChoice[] = [
      { id: null, label: computerLabel(account.name), cloud: false, selected: !active },
      ...organizations.map((o) => ({ id: o.id, label: o.name, cloud: true, selected: o.id === active?.id })),
    ];
    for (const organization of choices) entries.push({ kind: "organization", organization });
    entries.push({ kind: "separator" });
  }
  entries.push({ kind: "item", id: "settings", label: "Settings" });
  return {
    triggerLabel: active ? active.name : computerLabel(account.name),
    triggerIcon: personIcon(account.name),
    triggerOrganization: !!active,
    entries,
  };
}
