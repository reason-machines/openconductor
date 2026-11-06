import { Fragment, useState, type MouseEvent, type ReactNode } from "react";
import { openUrl } from "../backend";
import { Tooltip } from "../components/Tooltip";
import { CopyIcon, ExternalIcon } from "../components/Icons";
import { PopoverMenu, type PopoverMenuItem } from "../components/PopoverMenu";
import type { Point } from "../components/popoverMenuPlacement";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import type { Repo } from "../state/types";
import { AccountPage } from "./AccountPage";
import { AdvancedPage } from "./AdvancedPage";
import { AgentsPage } from "./AgentsPage";
import { AppearancePage } from "./AppearancePage";
import { DefaultModelsPage } from "./DefaultModelsPage";
import { EnvironmentPage } from "./EnvironmentPage";
import { GeneralPage } from "./GeneralPage";
import { GitPage } from "./GitPage";
import { KeyBindingsPage } from "./KeyBindingsPage";
import { BigTerminalPage } from "./BigTerminalPage";
import { ExperimentalPage } from "./ExperimentalPage";
import { pageLabel, settingsGroups, type SettingsPage } from "./pages";
import { RepoSettingsPage } from "./RepoSettingsPage";
import type { RepoMiscActions } from "./rows/RepoMiscRows";
import { REPO_SECTIONS, REPO_SECTION_LABELS, sameLocation, settingsDeepLink, type SettingsLocation } from "./routes";
import type { Settings } from "./types";
import { useSettings } from "./useSettings";
import {
  AgentIcon,
  BackIcon,
  ChipIcon,
  DriveIcon,
  FlaskIcon,
  GitIcon,
  KeyboardIcon,
  KeyIcon,
  PaletteIcon,
  PointerClickIcon,
  ScriptIcon,
  SlidersHorizontalIcon,
  SlidersIcon,
  TerminalIcon,
  UserCircleIcon,
} from "./icons";
import "./settings.css";

interface Props {
  location: SettingsLocation;
  repos: Repo[];
  onNavigate: (location: SettingsLocation) => void;
  onClose: () => void;
  /** Repository › Misc: change a repository's icon, after a removal, and toasts. */
  miscActions: RepoMiscActions;
}

/**
 * Full-window settings: grouped page list on the left, the page on the right. Esc goes back.
 * Under "Agents & environment" a Repositories list opens each repository's own
 * settings (Conductor's `A9a`): the active repository expands to its sections.
 */
export function SettingsView({ location, repos, onNavigate, onClose, miscActions }: Props) {
  const { settings, error, save, reload } = useSettings();

  useKeybindings({ "settings.close": onClose });

  // Right-click menus (Conductor's `t9a` on each page link, and its app-wide `X$r` for
  // links with a scheme). Conductor's toasts: "Copied link to clipboard" (`n5`),
  // "Failed to copy to clipboard", "Failed to open link".
  const [menu, setMenu] = useState<{ at: Point; offset: Point; items: PopoverMenuItem[]; label: string } | null>(null);
  const notify = miscActions.notify;
  const copyLink = (href: string) => {
    void (navigator.clipboard?.writeText(href) ?? Promise.reject(new Error("no clipboard"))).then(
      () => notify("info", "Copied link to clipboard"),
      () => notify("error", "Failed to copy to clipboard"),
    );
  };
  const copyLinkItem = (href: string): PopoverMenuItem => ({ label: "Copy link", icon: <CopyIcon />, onSelect: () => copyLink(href) });
  const onNavContextMenu = (to: SettingsLocation, label: string) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // `gy` defaults: side right, sideOffset 2, align start, at the pointer.
    setMenu({ at: { x: e.clientX, y: e.clientY }, offset: { x: 2, y: 0 }, items: [copyLinkItem(settingsDeepLink(to))], label: `${label} link` });
  };
  const onPageContextMenu = (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    const a = (e.target as Element).closest?.("a");
    const href = a?.getAttribute("href");
    // Conductor's `T$r`: only links whose href has a scheme (https:, mailto:, ...).
    if (!a || !href || !/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    e.preventDefault();
    setMenu({
      at: { x: e.clientX, y: e.clientY },
      offset: { x: 0, y: -5 },
      label: "Link",
      items: [
        { label: "Open link", icon: <ExternalIcon />, onSelect: () => void openUrl(a.href).catch(() => notify("error", "Failed to open link")) },
        copyLinkItem(a.href),
      ],
    });
  };

  const repo = location.scope === "repo" ? repos.find((r) => r.id === location.repoId) : undefined;
  const title = location.scope === "user" ? pageLabel(location.page) : REPO_SECTION_LABELS[location.section];
  const navButton = (to: SettingsLocation, label: string, className = "nav-item", icon?: ReactNode) => {
    const active = sameLocation(to, location);
    return (
      <button
        key={label}
        className={`${className} ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(to)}
        onContextMenu={onNavContextMenu(to, label)}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };
  const header = location.scope === "user" ? PAGE_HEADERS[location.page] : REPO_HEADERS[location.section];

  return (
    <div className="settings" onContextMenu={onPageContextMenu}>
      {menu && <PopoverMenu at={menu.at} offset={menu.offset} items={menu.items} label={menu.label} onClose={() => setMenu(null)} />}
      <nav className="settings-nav" aria-label="Settings pages">
        <div className="sidebar-drag" data-tauri-drag-region />
        <div className="settings-nav-top">
          {/* Conductor's `I9a`: Root delayDuration 100, content side "right", text "Esc". */}
          <Tooltip content="Esc" side="right" delay={BACK_TOOLTIP_DELAY_MS}>
            <button className="settings-back" tabIndex={-1} onClick={onClose}>
              <BackIcon />
              Back
            </button>
          </Tooltip>
        </div>
        {settingsGroups(settings?.experimental?.experimental_big_terminal_mode === true).map((g) => (
          <Fragment key={g.title || g.pages[0]?.id}>
            <div className="settings-group">
              {g.title && <div className="settings-group-title">{g.title}</div>}
              {g.pages.map((p) => navButton({ scope: "user", page: p.id }, p.label, "nav-item", PAGE_ICONS[p.id]))}
            </div>
            {g.title === "Agents & environment" && (
              <RepositoriesNav repos={repos} location={location} onNavigate={onNavigate} navButton={navButton} />
            )}
          </Fragment>
        ))}
      </nav>
      <section className="settings-page">
        <div className="settings-page-inner">
          {!(location.scope === "user" ? SELF_HEADED.includes(location.page) : location.section === "environment") && (
            <header className="settings-header">
              <div>
                <h1>{title}</h1>
                {header?.description && <p>{header.description}</p>}
              </div>
            </header>
          )}
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
          {location.scope === "repo" ? (
            repo ? (
              <RepoSettingsPage repo={repo} section={location.section} miscActions={miscActions} />
            ) : (
              <p className="muted">This repository is no longer in OpenConductor.</p>
            )
          ) : !settings ? (
            <p className="muted">Loading…</p>
          ) : (
            <UserPage page={location.page} settings={settings} save={save} reload={reload} />
          )}
        </div>
      </section>
    </div>
  );
}

function UserPage({
  page,
  settings,
  save,
  reload,
}: {
  page: SettingsPage;
  settings: Settings;
  save: ReturnType<typeof useSettings>["save"];
  reload: () => void;
}) {
  switch (page) {
    case "account":
      return <AccountPage settings={settings} save={save} />;
    case "environment":
      return <EnvironmentPage settings={settings} save={save} />;
    case "key-bindings":
      return <KeyBindingsPage settings={settings} save={save} />;
    case "models":
      return <DefaultModelsPage settings={settings} save={save} />;
    case "providers":
      return <AgentsPage settings={settings} save={save} reload={reload} />;
    case "appearance":
      return <AppearancePage settings={settings} save={save} />;
    case "experimental":
      return <ExperimentalPage settings={settings} save={save} />;
    case "terminal":
      return <BigTerminalPage settings={settings} save={save} />;
    case "advanced":
      return <AdvancedPage settings={settings} save={save} />;
    case "git":
      return <GitPage settings={settings} save={save} />;
    case "general":
      return <GeneralPage settings={settings} save={save} />;
  }
}

function RepositoriesNav({
  repos,
  location,
  onNavigate,
  navButton,
}: {
  repos: Repo[];
  location: SettingsLocation;
  onNavigate: (location: SettingsLocation) => void;
  navButton: (to: SettingsLocation, label: string, className?: string, icon?: ReactNode) => JSX.Element;
}) {
  return (
    <div className="settings-group settings-repos" aria-label="Repositories" role="group">
      <div className="settings-group-title">Repositories</div>
      {repos.length === 0 && <div className="settings-repos-empty muted small">None</div>}
      {repos.map((r) => {
        const open = location.scope === "repo" && location.repoId === r.id;
        return (
          <div key={r.id}>
            <button
              className={`nav-item settings-repo ${open ? "open" : ""}`}
              aria-expanded={open}
              aria-label={r.name}
              onClick={() => onNavigate({ scope: "repo", repoId: r.id, section: "environment" })}
            >
              <span className="settings-repo-initial" aria-hidden>
                {r.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{r.name}</span>
            </button>
            {open && (
              <div className="settings-repo-sections">
                {REPO_SECTIONS.map((s) => navButton({ scope: "repo", repoId: r.id, section: s }, REPO_SECTION_LABELS[s], "nav-item", REPO_SECTION_ICONS[s]))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PAGE_ICONS: Record<SettingsPage, ReactNode> = {
  general: <SlidersIcon />,
  account: <UserCircleIcon />,
  appearance: <PaletteIcon />,
  "key-bindings": <KeyboardIcon />,
  models: <ChipIcon />,
  git: <GitIcon />,
  providers: <AgentIcon />,
  environment: <KeyIcon />,
  experimental: <FlaskIcon />,
  advanced: <DriveIcon />,
  terminal: <TerminalIcon />,
};

/** Settings' Back opens its "Esc" tooltip after 100 ms, not the app's 600 ms (Conductor's `I9a`). */
const BACK_TOOLTIP_DELAY_MS = 100;

/** Pages that draw their own header (Conductor's environment panel has an "Add" action beside its title). */
const SELF_HEADED: readonly SettingsPage[] = ["environment", "providers"];

/** Conductor's `_Sa` page headers: a description under the title where it has one. */
const PAGE_HEADERS: Partial<Record<SettingsPage, { description: ReactNode }>> = {
  experimental: {
    description: (
      <>
        Experimental features that are under development. <strong>Expect breaking changes.</strong>
      </>
    ),
  },
};
/** Conductor's repository tab icons: the Git and Environment pages' own, then file-code, mouse-pointer-click, sliders-horizontal. */
const REPO_SECTION_ICONS: Record<(typeof REPO_SECTIONS)[number], ReactNode> = {
  git: <GitIcon />,
  environment: <KeyIcon />,
  scripts: <ScriptIcon />,
  actions: <PointerClickIcon />,
  misc: <SlidersHorizontalIcon />,
};
const REPO_HEADERS: Partial<Record<(typeof REPO_SECTIONS)[number], { description: ReactNode }>> = {
  scripts: { description: "Commands that run when workspaces are set up, run, or archived." },
  actions: { description: "Configure action-specific behavior and instructions for this repository." },
  misc: { description: "Repository paths and workspace file behavior." },
};
