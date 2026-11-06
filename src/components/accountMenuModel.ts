// The sidebar's Account menu model (the top row: avatar, "<name>'s Mac",
// chevron). Ported from Conductor 0.87.6's decoded renderApp-D_fmY7hW.js:
// `iEi` @6,090,883, `Q$t`, `YTt` @6,091,025, `Jzs` @6,091,307 (presentation)
// and `zna` @9,957,506 (menu). See evidence/sidebar-resource-usage/NOTES.md.
//
// Conductor's row is an organization switcher for its cloud account: the
// personal organization reads "<name>'s Mac", other organizations their own
// names. OpenConductor has no Conductor account or organizations, so the
// only organization is the personal one, and the person is the local user
// (`local_account`). Pure: unit tested in accountMenuModel.test.ts.

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
  | { kind: "org"; id: string; label: string; cloud: boolean; selected: boolean }
  | { kind: "item"; id: "settings"; label: string };

export interface AccountMenuModel {
  triggerLabel: string;
  triggerIcon: PersonIcon;
  /** The trigger shows a building (`Building2`) for a team organization, not the avatar. */
  triggerCloud: boolean;
  entries: AccountMenuEntry[];
}

/**
 * A team organization the switcher lists besides the personal one: for
 * OpenConductor, the Reason workspace the `reason` CLI is signed in to.
 */
export interface TeamOrganization {
  id: string;
  name: string;
  selected: boolean;
}

/**
 * `Jzs` + `zna`, for a single (personal) organization: the email heading,
 * then Settings. Conductor's organization list only appears with more than
 * one organization, and "Create organization" / "Upgrade to Pro" only when
 * the cloud account offers them, so neither appears here. Its last entry,
 * "Log out", ends the Conductor cloud session; with no account there is
 * nothing to end, so it is left out rather than shown doing nothing.
 */
export function accountMenuModel(account: LocalAccount, team?: TeamOrganization): AccountMenuModel {
  const entries: AccountMenuEntry[] = [];
  if (account.email) entries.push({ kind: "email", email: account.email }, { kind: "separator" });
  // `zna` with more than one organization: the personal one, then each team one, a check on the active one.
  if (team) {
    entries.push(
      { kind: "org", id: PERSONAL_ORG, label: computerLabel(account.name), cloud: false, selected: !team.selected },
      { kind: "org", id: team.id, label: team.name, cloud: true, selected: team.selected },
      { kind: "separator" },
    );
  }
  entries.push({ kind: "item", id: "settings", label: "Settings" });
  const onTeam = team?.selected === true;
  return {
    triggerLabel: onTeam ? team.name : computerLabel(account.name),
    triggerIcon: onTeam ? { fallbackInitial: undefined, imageAlt: team.name } : personIcon(account.name),
    triggerCloud: onTeam,
    entries,
  };
}

/** The personal organization's id in the switcher. */
export const PERSONAL_ORG = "personal";
