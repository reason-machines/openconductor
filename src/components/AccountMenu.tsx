// The sidebar's top row and its Account menu (Conductor 0.87.6 `oOt` →
// `zna` @9,957,506 in the decoded renderApp-D_fmY7hW.js): a button labelled
// "Account menu" with the avatar, "<name>'s Mac" and a chevron, opening a
// 260 px menu aligned to its left edge. The model is in accountMenuModel.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CheckIcon, ChevronDownIcon, SettingsIcon, UserIcon } from "./Icons";
import { accountMenuModel, type LocalAccount, type TeamOrganization } from "./accountMenuModel";
import { endingProps, useMenuPresence } from "./sidebarMotion";

const NO_ACCOUNT: LocalAccount = { name: "", email: null };

function useLocalAccount(): LocalAccount {
  const [account, setAccount] = useState<LocalAccount>(NO_ACCOUNT);
  useEffect(() => {
    if (!isTauri()) return;
    invoke<LocalAccount>("local_account").then(setAccount, (err) => console.warn("local account unavailable", err));
  }, []);
  return account;
}

/** lucide building-2 (Conductor's `YTt` for a team organization). */
const BuildingIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </svg>
);

/**
 * `team`: a team organization to list beside the personal one (the Reason
 * workspace, in Settings); `onSelectOrganization` gets the picked id.
 */
export function AccountMenu({
  onOpenSettings,
  team,
  onSelectOrganization,
}: {
  onOpenSettings: () => void;
  team?: TeamOrganization;
  onSelectOrganization?: (id: string) => void;
}) {
  const account = useLocalAccount();
  const model = accountMenuModel(account, team);
  const [open, setOpen] = useState(false);
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
          {model.triggerCloud ? (
            <BuildingIcon size={14} />
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
            ) : e.kind === "org" ? (
              <button
                key={e.id}
                type="button"
                role="menuitemradio"
                aria-checked={e.selected}
                className="sb-account-item"
                onClick={() => {
                  close();
                  if (!e.selected) onSelectOrganization?.(e.id);
                }}
              >
                <span className="sb-account-item-icon">{e.cloud ? <BuildingIcon /> : <UserIcon size={14} />}</span>
                <span className="sb-account-item-label">{e.label}</span>
                {e.selected && (
                  <span className="sb-account-item-check">
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
                  onOpenSettings();
                }}
              >
                <span className="sb-account-item-icon"><SettingsIcon size={14} /></span>
                <span>{e.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
