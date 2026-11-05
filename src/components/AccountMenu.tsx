// The sidebar's top row and its Account menu (Conductor 0.87.6 `oOt` →
// `zna` @9,957,506 in the decoded renderApp-D_fmY7hW.js): a button labelled
// "Account menu" with the avatar, "<name>'s Mac" and a chevron, opening a
// 260 px menu aligned to its left edge. The model is in accountMenu.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ChevronDownIcon, SettingsIcon, UserIcon } from "./Icons";
import { accountMenuModel, type LocalAccount } from "./accountMenu";

const NO_ACCOUNT: LocalAccount = { name: "", email: null };

function useLocalAccount(): LocalAccount {
  const [account, setAccount] = useState<LocalAccount>(NO_ACCOUNT);
  useEffect(() => {
    if (!isTauri()) return;
    invoke<LocalAccount>("local_account").then(setAccount, (err) => console.warn("local account unavailable", err));
  }, []);
  return account;
}

export function AccountMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const account = useLocalAccount();
  const model = accountMenuModel(account);
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
  return (
    <div ref={ref} className="sb-account">
      <button type="button" className="sb-row sb-computer" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sb-row-icon">
          <span className="sb-avatar" aria-hidden>
            {icon.fallbackInitial ?? <UserIcon size={10} />}
          </span>
        </span>
        <span className="sb-computer-name">{model.triggerLabel}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className="sb-account-menu" role="menu" aria-label="Account">
          {model.entries.map((e, i) =>
            e.kind === "email" ? (
              <div key="email" className="sb-account-email" role="presentation">{e.email}</div>
            ) : e.kind === "separator" ? (
              <div key={`sep-${i}`} role="separator" className="sb-menu-sep" />
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
