import { Row } from "./GeneralPage";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › More › Experimental. Conductor's tab has many more flags; only
 * Big terminal mode is built (evidence/terminal/NOTES.md). Turning it on also
 * lists the Big terminal tab in the settings navigation, as Conductor does.
 */
export function ExperimentalPage({ settings, save }: Props) {
  const on = settings.experimental?.experimental_big_terminal_mode === true;
  return (
    <div className="settings-rows">
      <Row label="Big terminal mode" help="Create big terminals in the center pane with ⌘⇧T">
        <input
          type="checkbox"
          role="switch"
          aria-label="Big terminal mode"
          checked={on}
          onChange={(e) => save({ ...settings, experimental: { ...settings.experimental, experimental_big_terminal_mode: e.target.checked } })}
        />
      </Row>
    </div>
  );
}
