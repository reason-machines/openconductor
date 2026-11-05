import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { AdvancedPage } from "./AdvancedPage";
import { AgentsPage } from "./AgentsPage";
import { AppearancePage } from "./AppearancePage";
import { DefaultModelsPage } from "./DefaultModelsPage";
import { GeneralPage } from "./GeneralPage";
import { GitPage } from "./GitPage";
import { KeyBindingsPage } from "./KeyBindingsPage";
import { BigTerminalPage } from "./BigTerminalPage";
import { ExperimentalPage } from "./ExperimentalPage";
import { pageLabel, settingsGroups, type SettingsPage } from "./pages";
import { useSettings } from "./useSettings";

interface Props {
  page: SettingsPage;
  onNavigate: (page: SettingsPage) => void;
  onClose: () => void;
}

/** Full-window settings: grouped page list on the left, the page on the right. Esc goes back. */
export function SettingsView({ page, onNavigate, onClose }: Props) {
  const { settings, error, save, reload } = useSettings();

  useKeybindings({ "settings.close": onClose });

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings pages">
        <div className="sidebar-drag" data-tauri-drag-region />
        {settingsGroups(settings?.experimental?.experimental_big_terminal_mode === true).map((g) => (
          <div key={g.title || g.pages[0]?.id} className="settings-group">
            {g.title && <div className="settings-group-title">{g.title}</div>}
            {g.pages.map((p) => (
              <button
                key={p.id}
                className={`nav-item ${p.id === page ? "active" : ""}`}
                aria-current={p.id === page ? "page" : undefined}
                onClick={() => onNavigate(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <section className="settings-page">
        <header className="settings-header">
          <h1>{pageLabel(page)}</h1>
          <button className="btn btn-small" title="Esc" onClick={onClose}>
            Back
          </button>
        </header>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        {!settings ? (
          <p className="muted">Loading…</p>
        ) : page === "key-bindings" ? (
          <KeyBindingsPage settings={settings} save={save} />
        ) : page === "models" ? (
          <DefaultModelsPage settings={settings} save={save} />
        ) : page === "providers" ? (
          <AgentsPage settings={settings} reload={reload} />
        ) : page === "appearance" ? (
          <AppearancePage settings={settings} save={save} />
        ) : page === "experimental" ? (
          <ExperimentalPage settings={settings} save={save} />
        ) : page === "terminal" ? (
          <BigTerminalPage settings={settings} save={save} />
        ) : page === "advanced" ? (
          <AdvancedPage settings={settings} save={save} />
        ) : page === "git" ? (
          <GitPage settings={settings} save={save} />
        ) : (
          <GeneralPage settings={settings} save={save} />
        )}
      </section>
    </div>
  );
}
