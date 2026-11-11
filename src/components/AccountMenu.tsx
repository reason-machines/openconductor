// The sidebar's top row and its Account menu (Conductor 0.87.6 `oOt` →
// `zna` @9,957,506 in the decoded renderApp-D_fmY7hW.js): a button labelled
// "Account menu" with the avatar, "<name>'s Mac" and a chevron, opening a
// 260 px menu aligned to its left edge. The model is in accountMenuModel.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CheckIcon, ChevronDownIcon, CloudIcon, SettingsIcon, UserIcon } from "./Icons";
import { ConductorIcon } from "./ConductorIcon";
import { useOrganization } from "../org/useOrganization";
import { accountMenuModel, type LocalAccount } from "./accountMenuModel";
import { signOutOfReason } from "../onboarding/reasonSignIn";
import { signedIn, type ReasonAccount } from "../settings/agents/reasonModes";
import { endingProps, useMenuPresence } from "./sidebarMotion";

const NO_ACCOUNT: LocalAccount = { name: "", email: null };

const hasBackend = () => isTauri() || "__TAURI_INTERNALS__" in window;

function useLocalAccount(): LocalAccount {
  const [account, setAccount] = useState<LocalAccount>(NO_ACCOUNT);
  useEffect(() => {
    if (!hasBackend()) return;
    invoke<LocalAccount>("local_account").then(setAccount, (err) => console.warn("local account unavailable", err));
  }, []);
  return account;
}

/** The Reason account this computer is signed in to (`reason status`), read again each time the menu opens. */
function useReasonAccount(open: boolean): [ReasonAccount | null, (a: ReasonAccount | null) => void] {
  const [account, setAccount] = useState<ReasonAccount | null>(null);
  useEffect(() => {
    if (!hasBackend()) return;
    let live = true;
    invoke<ReasonAccount>("reason_account_status").then(
      (a) => live && setAccount(signedIn(a) ? a : null),
      () => live && setAccount(null),
    );
    return () => {
      live = false;
    };
  }, [open]);
  return [account, setAccount];
}

export function AccountMenu({ onOpenSettings, onError }: { onOpenSettings: () => void; onError?: (message: string) => void }) {
  const account = useLocalAccount();
  const { active, organizations, select } = useOrganization();
  // Until Reason answers, the stored choice stands in for the list, so the trigger names it right away.
  const orgs = organizations ?? (active ? [active] : []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useReasonAccount(open);
  const model = accountMenuModel(account, orgs, active?.id ?? null, reason);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onEvent = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onEvent);
    document.addEventListener("keydown", onEvent);
    return () => {
      document.removeEventListener("mousedown", onEvent);
      document.removeEventListener("keydown", onEvent);
    };
  }, [open, close]);
  const icon = model.triggerIcon;
  const popup = useMenuPresence(open);
  return (
    <div ref={ref} className="sb-account">
      <button type="button" className="sb-row sb-computer" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sb-row-icon">
          {model.triggerOrganization ? (
            // Conductor's organization trigger: lucide building-2, size-3.
            <ConductorIcon name="building-2" size={12} />
          ) : (
            <span className="sb-avatar" aria-hidden>
              {icon.fallbackInitial ?? <UserIcon size={10} />}
            </span>
          )}
        </span>
        <span className="sb-computer-name">{model.triggerLabel}</span>
        <ChevronDownIcon size={14} />
      </button>
      {popup.mounted && (
        <div className="sb-account-menu" role="menu" aria-label="Account" data-tauri-drag-region="false" {...endingProps(popup.ending)}>
          {model.entries.map((e, i) =>
            e.kind === "email" ? (
              <div key="email" className="sb-account-email" role="presentation">{e.email}</div>
            ) : e.kind === "separator" ? (
              <div key={`sep-${i}`} role="separator" className="sb-menu-sep" />
            ) : e.kind === "organization" ? (
              <button
                key={e.organization.id ?? "personal"}
                type="button"
                role="menuitemradio"
                aria-checked={e.organization.selected}
                className="sb-account-item"
                onClick={() => {
                  close();
                  select(e.organization.id === null ? null : (orgs.find((o) => o.id === e.organization.id) ?? null));
                }}
              >
                <span className="sb-account-item-icon">
                  {e.organization.id === null ? <UserIcon size={14} /> : <ConductorIcon name="building-2" size={14} />}
                </span>
                <span className="sb-account-org-label">{e.organization.label}</span>
                {e.organization.cloud && (
                  <span className="sb-account-org-cloud" aria-label="Cloud organization">
                    <CloudIcon size={12} />
                  </span>
                )}
                {e.organization.selected && (
                  <span className="sb-account-org-check">
                    <CheckIcon size={14} />
                  </span>
                )}
              </button>
            ) : (
              <button
                key={e.id}
                type="button"
                role="menuitem"
                className="sb-account-item"
                onClick={() => {
                  close();
                  if (e.id === "settings") return onOpenSettings();
                  // Conductor's Log out ends its account session; here, this computer's Reason sign-in.
                  signOutOfReason().then(
                    () => setReason(null),
                    (err: unknown) => onError?.(err instanceof Error ? err.message : String(err)),
                  );
                }}
              >
                <span className="sb-account-item-icon">{e.id === "settings" ? <SettingsIcon size={14} /> : <ConductorIcon name="log-out" size={14} />}</span>
                <span>{e.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
