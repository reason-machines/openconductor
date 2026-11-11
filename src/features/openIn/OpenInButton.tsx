import { ShortcutHint, Tooltip } from "../../components/ui/Tooltip.tsx";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { usePresence } from "../../components/motion/usePresence.ts";
import { PRIORITY } from "../../keybindings/dispatcher.ts";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { ChevronDownIcon, CodeIcon, CopyIcon, FolderIcon, TerminalIcon } from "../../components/Icons";
import { recordOpenIn, useAppPrefs } from "../../settings/appPrefs";
import { COPY_PATH_TOAST, NUMBERED_ROWS, copyText, defaultAppId, loadOpenInApps, openInApp, rowNumbers, type OpenInApp } from "./apps";
import { AppSwitcher } from "./AppSwitcher.tsx";
import "./openIn.css";

type Notify = (kind: "info" | "error", message: string) => void;

interface Props {
  /** The workspace folder; the button is disabled without one. */
  path: string | null;
  notify?: Notify;
  /**
   * "icon": only the chevron and its menu, as Conductor's `P9` with
   * `size: "icon"` beside settings paths. It registers no shortcuts.
   */
  variant?: "split" | "icon";
  showShortcutHint?: boolean;
}

/** The app's own icon with Conductor's hairline frame, else its kind's glyph. */
export function AppIcon({ app, size }: { app: Pick<OpenInApp, "name" | "icon" | "iconType">; size: number }) {
  if (app.icon) {
    return (
      <span className="oi-app-icon" style={{ width: size, height: size }}>
        <img src={app.icon} alt={`${app.name} icon`} draggable={false} />
      </span>
    );
  }
  const Glyph = app.iconType === "folder" ? FolderIcon : app.iconType === "terminal" ? TerminalIcon : CodeIcon;
  return (
    <span className="oi-app-glyph" aria-hidden>
      <Glyph size={size} />
    </span>
  );
}

/** Apps the backend offers to open things in; null until loaded. */
export function useInstalledApps(): OpenInApp[] | null {
  const [apps, setApps] = useState<OpenInApp[] | null>(null);
  useEffect(() => {
    let live = true;
    loadOpenInApps().then(
      (a) => live && setApps(a),
      (err) => {
        console.warn("could not list apps to open in", err);
        if (live) setApps([]);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return apps;
}

export function OpenInButton({ path, notify, variant = "split", showShortcutHint = true }: Props) {
  const split = variant === "split";
  const installed = useInstalledApps();
  const apps = installed ?? [];
  const prefs = useAppPrefs();
  const defaultId = defaultAppId(apps, prefs.default_open_in);
  const defaultApp = apps.find((a) => a.id === defaultId);
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { overrides } = useKeybindingOverrides();
  const openKey = effectiveShortcuts("workspace.openInApp", overrides)[0];
  const openKeyText = openKey ? glyphs(openKey) : "";

  const openIn = async (appId: string) => {
    if (!path) return notify?.("error", "No workspace path available");
    // Conductor records the app as the default (and in the MRU order) before it opens.
    void recordOpenIn(appId, false).catch((err) => console.warn("could not save the default app", err));
    try {
      await openInApp(appId, path);
    } catch (err) {
      notify?.("error", `Failed to open in ${appId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const copyPath = async () => {
    if (!path) return;
    try {
      await copyText(path);
      notify?.("info", COPY_PATH_TOAST);
    } catch {
      notify?.("error", "Failed to copy to clipboard");
    }
  };

  const noApps = !path || apps.length === 0;
  const close = () => setOpen(false);
  const rows = [...apps.map((a) => () => void openIn(a.id)), () => void copyPath()];
  const numbers = rowNumbers(apps.length);

  useKeybindings({
    "workspace.openInMenu": split && path ? () => setOpen(true) : undefined,
  });
  // 1-9 pick a row while the menu is open (Conductor's `cJe`).
  useKeybindings(
    Object.fromEntries(
      Array.from({ length: NUMBERED_ROWS }, (_, i) => {
        const row = split && open ? rows[i] : undefined;
        return [`menu.selectItem${i + 1}`, row && (() => (close(), row()))];
      }),
    ),
    PRIORITY.DIALOG,
  );

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  // ArrowUp / ArrowDown move between rows and wrap (Conductor's `_vs`); Escape closes.
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      wrap.current?.querySelector<HTMLElement>(".oi-chevron")?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  const mainLabel = defaultApp ? `Open in ${defaultApp.name}` : "Open in...";
  return (
    <div className={split ? "oi" : "oi oi-icon"} ref={wrap} data-testid={split ? "open-in" : undefined}>
      {split && path && <AppSwitcher key={path} apps={apps} mru={prefs.open_in_mru_order} onOpen={(appId) => void openIn(appId)} />}
      {/* Conductor's yvs: "Open in <app>" and the workspace.openInApp hint; no tooltip without a default app. */}
      {split && (
        <Tooltip
          disabled={!defaultApp}
          content={
            <div className="oc-tip-row">
              <span>{mainLabel}</span>
              <ShortcutHint commandId="workspace.openInApp" />
            </div>
          }
        >
          <button type="button" className="oi-main" disabled={noApps || !defaultApp} aria-label={mainLabel} onClick={() => defaultId && void openIn(defaultId)}>
            {defaultApp ? <AppIcon app={defaultApp} size={12} /> : <FolderIcon size={12} />}
          </button>
        </Tooltip>
      )}
      <Tooltip content={<span>Open in...</span>}>
        <button
          type="button"
          className="oi-chevron"
          disabled={noApps}
          aria-label="Open in..."
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDownIcon size={12} />
        </button>
      </Tooltip>
      {presence.mounted && (
        <div className="oi-menu" role="menu" aria-label="Open in" ref={menu} onKeyDown={onMenuKey} data-tauri-drag-region="false" data-motion="popup" {...presence.attrs}>
          {installed === null ? (
            <div className="oi-menu-note">Loading…</div>
          ) : apps.length === 0 ? (
            <div className="oi-menu-note">No apps available</div>
          ) : (
            apps.map((a, i) => (
              <button key={a.id} type="button" role="menuitem" className="oi-row" data-app={a.id} onClick={() => (close(), void openIn(a.id))}>
                <span className="oi-row-main">
                  <AppIcon app={a} size={14} />
                  <span className="oi-row-label">{a.name}</span>
                </span>
                <span className="oi-row-end">
                  {showShortcutHint && a.id === defaultId && openKeyText && <span className="oi-row-kbd">{openKeyText}</span>}
                  {split && numbers.apps[i] !== undefined && <span className="oi-row-num">{numbers.apps[i]}</span>}
                </span>
              </button>
            ))
          )}
          <button type="button" role="menuitem" className="oi-row" data-app="copy-path" onClick={() => (close(), void copyPath())}>
            <span className="oi-row-main">
              <span className="oi-app-glyph" aria-hidden>
                <CopyIcon size={14} />
              </span>
              <span className="oi-row-label">Copy path</span>
            </span>
            {split && numbers.copyPath !== undefined && (
              <span className="oi-row-end">
                <span className="oi-row-num">{numbers.copyPath}</span>
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
