import { Fragment, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { openUrl } from "../backend";
import { AccountMenu } from "../components/AccountMenu";
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
import { AGENTS_TABS, AGENTS_TAB_LABEL, agentsTabFrom } from "./agents/kitModel";
import { selectProviderTab } from "./providerTab";
import { CloudCogIcon, CloudSetupPage } from "./cloud/CloudSetupPage";
import { REASON_PLAN_URL } from "./cloud/cloudSetup";
import { useCloudSetup } from "./cloud/useCloudSetup";
import { ConductorIcon } from "../components/ConductorIcon";
import { useOrganization } from "../org/useOrganization";
import { ORG_HEADERS, OrgPage } from "./org/OrgPages";
import { orgSettingsGroups, pageLabel, settingsGroups, type OrgNavEntry, type SettingsPage } from "./pages";
import { RepoSettingsPage } from "./RepoSettingsPage";
import type { RepoMiscActions } from "./rows/RepoMiscRows";
import { REPO_SECTIONS, REPO_SECTION_LABELS, sameLocation, settingsDeepLink, type OrgPage as OrgPageId, type RepoSection, type SettingsLocation } from "./routes";
import { buildSearchIndex, type SearchItem } from "./searchIndex";
import { SettingsSearch } from "./SettingsSearch";
import type { Settings } from "./types";
import { useSettings } from "./useSettings";
import { boolPref } from "./prefs";
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
  /** Cloud setup's "Launch a cloud workspace" (Conductor's `Gua`: home, then the create dialog). */
  onLaunchCloudWorkspace: () => void;
}

/**
 * Full-window settings: grouped page list on the left, the page on the right. Esc goes back.
 * Under "Agents & environment" a Repositories list opens each repository's own
 * settings (Conductor's `A9a`): the active repository expands to its sections.
 */
export function SettingsView({ location, repos, onNavigate, onClose, miscActions, onLaunchCloudWorkspace }: Props) {
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
  const title =
    location.scope === "user" ? pageLabel(location.page) : location.scope === "org" ? ORG_HEADERS[location.page].title : REPO_SECTION_LABELS[location.section];
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
  const header =
    location.scope === "user" ? PAGE_HEADERS[location.page] : location.scope === "org" ? ORG_HEADERS[location.page] : REPO_HEADERS[location.section];
  const bigTerminal = settings?.experimental?.experimental_big_terminal_mode === true;
  // A Reason workspace as the active organization turns on Conductor's organization view (`I9a` showOrganization).
  const organization = useOrganization().active;
  // The Cloud group shows for a signed-in Reason CLI (Conductor's cloud entitlement, `F` in `L9a`), personal accounts only.
  const cloudUI = settings !== null && boolPref(settings, "experimental_cloud_ui");
  const cloud = useCloudSetup().setup?.signedIn === true && !organization && cloudUI;
  const groups = useMemo(() => settingsGroups(bigTerminal, cloud), [bigTerminal, cloud]);
  const orgGroups = useMemo(() => (cloudUI && organization ? orgSettingsGroups(bigTerminal) : null), [cloudUI, organization, bigTerminal]);
  const orgEntry = (e: OrgNavEntry) =>
    e.kind === "billing" ? (
      // Conductor's `k9a`: Billing opens the billing portal in the browser; here, the Reason workspace's plan.
      <button key="billing" type="button" className="nav-item" onClick={() => void openUrl(REASON_PLAN_URL).catch(() => notify("error", "Failed to open link"))}>
        <ConductorIcon name="credit-card" size={16} />
        <span>{e.label}</span>
        <ConductorIcon name="arrow-up-right" size={12} />
      </button>
    ) : e.kind === "org" ? (
      navButton({ scope: "org", page: e.page }, e.label, "nav-item", ORG_PAGE_ICONS[e.page])
    ) : (
      navButton({ scope: "user", page: e.page }, e.label, "nav-item", PAGE_ICONS[e.page])
    );
  const searchItems = useMemo(
    () => buildSearchIndex({ pages: groups.flatMap((g) => g.pages), agentTabs: AGENT_SEARCH_TABS, hasRepos: repos.length > 0 }),
    [groups, repos.length],
  );
  // Conductor's `wGt`: a repository section opens in the repository being viewed, else the first one.
  const openResult = (item: SearchItem) => {
    const t = item.target;
    if (t.scope === "repo") {
      const repoId = location.scope === "repo" ? location.repoId : repos[0]?.id;
      if (repoId) onNavigate({ scope: "repo", repoId, section: t.section });
    } else {
      onNavigate({ scope: "user", page: t.page });
      if (t.providerTab) selectProviderTab(agentsTabFrom(t.providerTab));
    }
    if (t.row) scrollToRow(t.row);
  };

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
        {/* Conductor's `I9a`: the account switcher ("pt-1.5", `oOt stayInSettings`), then "Search settings" ("px-0.5 py-3"). */}
        <div className="settings-nav-account">
          <AccountMenu onOpenSettings={() => onNavigate({ scope: "user", page: "general" })} />
        </div>
        <div className="settings-nav-search">
          <SettingsSearch items={searchItems} iconFor={searchIcon} onPick={openResult} />
        </div>
        {orgGroups?.map((g) => (
          <Fragment key={g.title}>
            <div className="settings-group">
              <div className="settings-group-title">{g.title}</div>
              {g.entries.map(orgEntry)}
            </div>
            {g.title === "Agents & environment" && (
              <RepositoriesNav repos={repos} location={location} onNavigate={onNavigate} navButton={navButton} />
            )}
          </Fragment>
        ))}
        {!orgGroups && groups.map((g) => (
          <Fragment key={g.title || g.pages[0]?.id}>
            <div className="settings-group">
              {g.title && (
                <div className={`settings-group-title ${g.badge ? "with-badge" : ""}`}>
                  {g.title}
                  {g.badge && <span className="cloud-badge">{g.badge}</span>}
                </div>
              )}
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
          {!(location.scope === "user" ? SELF_HEADED.includes(location.page) : location.scope === "repo" && location.section === "environment") && (
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
          {location.scope === "org" ? (
            settings ? (
              <OrgPage page={location.page} settings={settings} save={save} onNavigate={onNavigate} />
            ) : (
              <p className="muted">Loading…</p>
            )
          ) : location.scope === "repo" ? (
            repo ? (
              <RepoSettingsPage repo={repo} section={location.section} miscActions={miscActions} />
            ) : (
              <p className="muted">This repository is no longer in OpenConductor.</p>
            )
          ) : !settings ? (
            <p className="muted">Loading…</p>
          ) : (
            <UserPage
              page={location.page}
              settings={settings}
              save={save}
              reload={reload}
              notify={notify}
              onOpenReasonSettings={() => onNavigate({ scope: "user", page: "providers" })}
              onLaunchCloudWorkspace={onLaunchCloudWorkspace}
            />
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
  notify,
  onOpenReasonSettings,
  onLaunchCloudWorkspace,
}: {
  page: SettingsPage;
  settings: Settings;
  save: ReturnType<typeof useSettings>["save"];
  reload: () => void;
  notify: Props["miscActions"]["notify"];
  onOpenReasonSettings: () => void;
  onLaunchCloudWorkspace: () => void;
}) {
  switch (page) {
    case "setup-cloud":
      return <CloudSetupPage onOpenReasonSettings={onOpenReasonSettings} onLaunchCloudWorkspace={onLaunchCloudWorkspace} />;
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
      return <GeneralPage settings={settings} save={save} notify={notify} />;
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
  "setup-cloud": <CloudCogIcon />,
};

/** Conductor's organization tab icons (lucide message-square-text, key-round, blocks, laptop, sliders-horizontal, users). */
const ORG_PAGE_ICONS: Record<OrgPageId, ReactNode> = {
  prompts: <ConductorIcon name="message-square-text" size={16} />,
  environment: <KeyIcon />,
  mcp: <ConductorIcon name="blocks" size={16} />,
  computer: <ConductorIcon name="laptop" size={16} />,
  preferences: <SlidersHorizontalIcon />,
  members: <ConductorIcon name="users" size={16} />,
};

/** The Agents page's tabs, listed after Agents in search (Conductor's `$ba` per agent tab). */
export const AGENT_SEARCH_TABS = AGENTS_TABS.map((id) => ({ id, label: AGENTS_TAB_LABEL[id] }));

/** A search result's icon: its page's (Conductor's `tab.icon`), an agent tab's, or a repository section's. */
export const searchIcon = (item: SearchItem): ReactNode =>
  item.target.scope === "repo"
    ? REPO_SECTION_ICONS[item.target.section]
    : item.target.providerTab
      ? <AgentIcon />
      : PAGE_ICONS[item.target.page];

/** Conductor's `scrollTo`: once the page renders, bring the row with this title into view. */
export function scrollToRow(title: string, tries = 20) {
  requestAnimationFrame(() => {
    const label = Array.from(document.querySelectorAll(".settings-page [data-settings-row]")).find((row) =>
      Array.from(row.querySelectorAll(".settings-row-label, h2, h3, label, strong")).some((el) => el.textContent?.trim() === title),
    );
    if (label) label.scrollIntoView({ block: "start" });
    else if (tries > 0) scrollToRow(title, tries - 1);
  });
}

/** Settings' Back opens its "Esc" tooltip after 100 ms, not the app's 600 ms (Conductor's `I9a`). */
const BACK_TOOLTIP_DELAY_MS = 100;

/** Pages that draw their own header (Conductor's environment panel has an "Add" action beside its title). */
const SELF_HEADED: readonly SettingsPage[] = ["environment", "providers", "setup-cloud"];

/** Conductor's `_Sa` page headers: a description under the title where it has one. */
const PAGE_HEADERS: Partial<Record<SettingsPage, { description: ReactNode }>> = {
  terminal: { description: "Configure big terminal mode behavior (⌘⇧T)." },
  experimental: {
    description: (
      <>
        Experimental features that are under development. <strong>Expect breaking changes.</strong>
      </>
    ),
  },
};
/** Conductor's repository tab icons: the Git and Environment pages' own, then file-code, mouse-pointer-click, sliders-horizontal. */
const REPO_SECTION_ICONS: Record<RepoSection, ReactNode> = {
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
