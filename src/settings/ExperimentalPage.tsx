import { useEffect, useState } from "react";
import { autoRunAfterSetup, setAutoRunAfterSetup } from "../scripts/api";
import { errorText } from "./api";
import { Row } from "./GeneralPage";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › More › Experimental. Conductor's tab has many more flags; built
 * here are Big terminal mode (evidence/terminal/NOTES.md) and Auto-run after
 * setup (evidence/run-scripts/NOTES.md). Turning Big terminal mode on also
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
      <AutoRunAfterSetupRow />
    </div>
  );
}

/**
 * Conductor's user-scope `auto_run_after_setup` row (off by default). It is
 * stored as `scripts.auto_run_after_setup` in the user settings file that the
 * scripts service reads, not in the app settings above, so it has its own
 * commands.
 */
function AutoRunAfterSetupRow() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    autoRunAfterSetup().then(setEnabled, (e) => setError(errorText(e)));
  }, []);
  const change = (next: boolean) => {
    setError(null);
    setAutoRunAfterSetup(next).then(setEnabled, (e) => setError(errorText(e)));
  };
  return (
    <>
      <Row label="Auto-run after setup" help="Start a repository's run script automatically after a new local workspace finishes setup.">
        <input
          type="checkbox"
          role="switch"
          aria-label="Auto-run after setup"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={(e) => change(e.target.checked)}
        />
      </Row>
      {error && <p className="error small" role="alert">{error}</p>}
    </>
  );
}
