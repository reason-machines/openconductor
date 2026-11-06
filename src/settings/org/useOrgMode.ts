// Which organization Settings shows: the personal one (this Mac, local
// settings) or the Reason workspace the `reason` CLI is signed in to
// (Conductor's cloud organization: its settings nav, `/settings/organization`
// pages). Conductor switches with the organization switcher at the top of the
// settings nav (`oOt stayInSettings`); so does OpenConductor, and opening an
// organization page switches too. The choice is kept across restarts.
import { useCallback, useEffect, useState } from "react";
import { useCloudSetup } from "../cloud/useCloudSetup";
import { isOrgPage, type SettingsPage } from "../pages";
import { orgActive } from "./orgModel";

const KEY = "openconductor.settings.organization";
export const REASON_ORG = "reason";

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === REASON_ORG;
  } catch {
    return false;
  }
}

function store(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, REASON_ORG);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the choice lasts until the window closes.
  }
}

export interface OrgMode {
  /** The organization's settings are showing. */
  active: boolean;
  /** The Reason workspace's name, once the CLI answers signed in. */
  workspaceName: string | null;
  signedIn: boolean;
  select: (reason: boolean) => void;
}

export function useOrgMode(page: SettingsPage | null): OrgMode {
  const { setup } = useCloudSetup();
  const signedIn = setup?.signedIn === true;
  const [chosen, setChosen] = useState(stored);
  const onOrgPage = page !== null && isOrgPage(page);
  useEffect(() => {
    if (onOrgPage && !chosen) {
      store(true);
      setChosen(true);
    }
  }, [onOrgPage, chosen]);
  const select = useCallback((reason: boolean) => {
    store(reason);
    setChosen(reason);
  }, []);
  const workspaceName = setup?.identity?.workspaceName ?? setup?.identity?.workspaceSlug ?? null;
  return { active: orgActive(page, chosen, signedIn), workspaceName, signedIn, select };
}
