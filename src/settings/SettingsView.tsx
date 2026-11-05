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
import { REPO_SECTIONS, REPO_SECTION_LABELS, sameLocation, type SettingsLocation } from "./routes";
import type { Settings } from "./types";
import { useSettings } from "./useSettings";

interface Props {
  location: SettingsLocation;
  repos: Repo[];
  onNavigate: (location: SettingsLocation) => void;
  onClose: () => void;
}

/**
 * Full-window settings: grouped page list on the left, the page on the right. Esc goes back.
 * Under "Agents & environment" a Repositories list opens each repository's own
 * settings (Conductor's `A9a`): the active repository expands to its sections.
 */
export function SettingsView({ location, repos, onNavigate, onClose }: Props) {
  const { settings, error, save, reload } = useSettings();

  useKeybindings({ "settings.close": onClose });

  const repo = location.scope === "repo" ? repos.find((r) => r.id === location.repoId) : undefined;
  const title = location.scope === "user" ? pageLabel(location.page) : `${repo?.name ?? "Repository"} · ${REPO_SECTION_LABELS[location.section]}`;
  const navButton = (to: SettingsLocation, label: string, className = "nav-item") => {
    const active = sameLocation(to, location);
    return (
      <button
        key={label}
        className={`${className} ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(to)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings pages">
        <div className="sidebar-drag" data-tauri-drag-region />
        {settingsGroups(settings?.experimental?.experimental_big_terminal_mode === true).map((g) => (
          <div key={g.title || g.pages[0]?.id} className="settings-group">
            {g.title && <div className="settings-group-title">{g.title}</div>}
            {g.pages.map((p) => navButton({ scope: "user", page: p.id }, p.label))}
            {g.title === "Agents & environment" && (
              <RepositoriesNav repos={repos} location={location} onNavigate={onNavigate} navButton={navButton} />
            )}
          </div>
        ))}
      </nav>
      <section className="settings-page">
        <header className="settings-header">
          <h1>{title}</h1>
          <button className="btn btn-small" title="Esc" onClick={onClose}>
            Back
          </button>
        </header>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        {location.scope === "repo" ? (
          repo ? (
            <RepoSettingsPage repo={repo} section={location.section} />
          ) : (
            <p className="muted">This repository is no longer in OpenConductor.</p>
          )
        ) : !settings ? (
          <p className="muted">Loading…</p>
        ) : (
          <UserPage page={location.page} settings={settings} save={save} reload={reload} />
        )}
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
      return <AccountPage />;
    case "environment":
      return <EnvironmentPage />;
    case "key-bindings":
      return <KeyBindingsPage settings={settings} save={save} />;
    case "models":
      return <DefaultModelsPage settings={settings} save={save} />;
    case "providers":
      return <AgentsPage settings={settings} reload={reload} />;
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
  navButton: (to: SettingsLocation, label: string, className?: string) => JSX.Element;
}) {
  return (
    <div className="settings-repos" aria-label="Repositories" role="group">
      <div className="settings-group-title">Repositories</div>
      {repos.length === 0 && <div className="settings-repos-empty muted small">None</div>}
      {repos.map((r) => {
        const open = location.scope === "repo" && location.repoId === r.id;
        return (
          <div key={r.id}>
            <button
              className={`nav-item settings-repo ${open ? "open" : ""}`}
              aria-expanded={open}
              onClick={() => onNavigate({ scope: "repo", repoId: r.id, section: "environment" })}
            >
              {r.name}
            </button>
            {open && (
              <div className="settings-repo-sections">
                {REPO_SECTIONS.map((s) => navButton({ scope: "repo", repoId: r.id, section: s }, REPO_SECTION_LABELS[s]))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
