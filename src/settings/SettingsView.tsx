import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { GeneralPage } from "./GeneralPage";
import { GitPage } from "./GitPage";
import { KeyBindingsPage } from "./KeyBindingsPage";
import { pageLabel, SETTINGS_GROUPS, type SettingsPage } from "./pages";
import { useSettings } from "./useSettings";

interface Props {
  page: SettingsPage;
  onNavigate: (page: SettingsPage) => void;
  onClose: () => void;
}

/** Full-window settings: grouped page list on the left, the page on the right. Esc goes back. */
export function SettingsView({ page, onNavigate, onClose }: Props) {
  const { settings, error, save } = useSettings();

  useKeybindings({ "settings.close": onClose });

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings pages">
        <div className="sidebar-drag" data-tauri-drag-region />
        {SETTINGS_GROUPS.map((g) => (
          <div key={g.title} className="settings-group">
            <div className="settings-group-title">{g.title}</div>
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
        ) : page === "git" ? (
          <GitPage settings={settings} save={save} />
        ) : (
          <GeneralPage settings={settings} save={save} />
        )}
      </section>
    </div>
  );
}
