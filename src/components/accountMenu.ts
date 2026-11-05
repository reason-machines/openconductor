// The sidebar's Account menu model (the top row: avatar, "<name>'s Mac",
// chevron). Ported from Conductor 0.87.6's decoded renderApp-D_fmY7hW.js:
// `iEi` @6,090,883, `Q$t`, `YTt` @6,091,025, `Jzs` @6,091,307 (presentation)
// and `zna` @9,957,506 (menu). See evidence/sidebar-resource-usage/NOTES.md.
//
// Conductor's row is an organization switcher for its cloud account: the
// personal organization reads "<name>'s Mac", other organizations their own
// names. OpenConductor has no Conductor account or organizations, so the
// only organization is the personal one, and the person is the local user
// (`local_account`). Pure: unit tested in accountMenu.test.ts.

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

/** One entry of the open menu, in order. */
export type AccountMenuEntry =
  | { kind: "email"; email: string }
  | { kind: "separator" }
  | { kind: "item"; id: "settings"; label: string };

export interface AccountMenuModel {
  triggerLabel: string;
  triggerIcon: PersonIcon;
  entries: AccountMenuEntry[];
}

/**
 * `Jzs` + `zna`, for a single (personal) organization: the email heading,
 * then Settings. Conductor's organization list only appears with more than
 * one organization, and "Create organization" / "Upgrade to Pro" only when
 * the cloud account offers them, so neither appears here. Its last entry,
 * "Log out", ends the Conductor cloud session; with no account there is
 * nothing to end, so it is left out rather than shown doing nothing.
 */
export function accountMenuModel(account: LocalAccount): AccountMenuModel {
  const entries: AccountMenuEntry[] = [];
  if (account.email) entries.push({ kind: "email", email: account.email }, { kind: "separator" });
  entries.push({ kind: "item", id: "settings", label: "Settings" });
  return {
    triggerLabel: computerLabel(account.name),
    triggerIcon: personIcon(account.name),
    entries,
  };
}
