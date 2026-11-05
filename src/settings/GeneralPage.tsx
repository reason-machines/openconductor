import type { ReactNode } from "react";
import { withField } from "./model";
import type { Settings, SoundType, Theme } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function GeneralPage({ settings, save }: Props) {
  const g = settings.general;
  return (
    <div className="settings-rows">
      <Row label="Theme" help="Light, dark, or follow macOS.">
        <select value={g.theme} onChange={(e) => save(withField(settings, "general", "theme", e.target.value as Theme))}>
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Notifications" help="Post a macOS notification when an agent finishes or needs you.">
        <input
          type="checkbox"
          role="switch"
          aria-label="Notifications"
          checked={g.send_native_notification}
          onChange={(e) => save(withField(settings, "general", "send_native_notification", e.target.checked))}
        />
      </Row>
      <Row label="Completion sound" help="Play a sound when an agent finishes.">
        <select
          value={g.sound_type}
          onChange={(e) => save(withField(settings, "general", "sound_type", e.target.value as SoundType))}
        >
          <option value="default">Default</option>
          <option value="none">Off</option>
        </select>
      </Row>
    </div>
  );
}

export function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
        {help && <div className="muted small">{help}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
