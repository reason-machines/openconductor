import type { ReactNode } from "react";
import { withField } from "./model";
import { GeneralAppPrefRows } from "./rows/AppPrefRows";
import type { Settings, SoundType } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

export function GeneralPage({ settings, save }: Props) {
  const g = settings.general;
  return (
    <div className="settings-rows">
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
      <GeneralAppPrefRows />
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
