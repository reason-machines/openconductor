import { useEffect, useState, type ReactNode } from "react";
import { autoRunAfterSetup, setAutoRunAfterSetup } from "../scripts/api";
import { errorText } from "./api";
import { PrefSwitchRow, Toggle } from "./controls";
import { Row } from "./GeneralPage";
import { DashboardRow, GraphiteRow, ShowAgentCostRow, SidebarResourceUsageRow, TabFreakModeRow } from "./rows/AppPrefRows";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › More › Experimental, row for row with Conductor 0.87.6's
 * `experimental` tab (renderApp-D_fmY7hW.js registry, evidence/settings/NOTES.md
 * "Settings pages, row for row"). Left out: "Use default internal and
 * experimental settings" (internal builds only), and the New workspace page
 * row, which its own feature adds (open PR #388).
 * Turning Big terminal mode on also lists
 * the Big terminal tab in the settings navigation, as Conductor does.
 */
export function ExperimentalPage({ settings, save }: Props) {
  const on = settings.experimental?.experimental_big_terminal_mode === true;
  const row = (pref: Parameters<typeof PrefSwitchRow>[0]["pref"], label: string, help?: ReactNode) => (
    <PrefSwitchRow settings={settings} save={save} pref={pref} label={label} help={help} />
  );
  return (
    <div className="settings-rows">
      {row(
        "experimental_auto_permission_mode",
        "Auto permission mode",
        <>
          Turns on Claude auto mode.{" "}
          <a href="https://code.claude.com/docs/en/glossary#auto-mode" target="_blank" rel="noopener noreferrer">
            Learn more
          </a>
        </>,
      )}
      <Row label="Big terminal mode" help="Create big terminals in the center pane with ⌘⇧T">
        <Toggle
          label="Big terminal mode"
          checked={on}
          onChange={(checked) => save({ ...settings, experimental: { ...settings.experimental, experimental_big_terminal_mode: checked } })}
        />
      </Row>
      <TabFreakModeRow />
      {row("experimental_configurable_center_panel", "Split tabs", "Split the center panel and move tabs between panes.")}
      {row("experimental_fork_to_new_tab", "Fork chat to new tab", "Fork a chat, even mid-turn, from its tab's context menu or with ⌘⌥↵.")}
      {row(
        "experimental_in_app_browser_preview",
        "In-app browser preview",
        "Open the preview button in an in-app browser tab (with the annotation overlay) instead of your external browser.",
      )}
      {row("experimental_legacy_file_preview_and_editing", "Use legacy file preview and editing")}
      <ShowAgentCostRow />
      {row("experimental_show_workspace_numbers", "Show workspace numbers")}
      {row("internal_workspace_status_matrix", "Workspace status matrix", "Use the matrix-style workspace status indicator in Home and the sidebar.")}
      {row("experimental_cloud_desktop", "Cloud desktop", "Show Cloud desktop tabs in cloud workspaces.")}
      {row(
        "local_git_forge_enabled",
        "Add projects without GitHub",
        "Let OpenConductor add existing local repositories even when they are not connected to GitHub.",
      )}
      <AutoRunAfterSetupRow />
      {/* After Auto-run after setup, before Voice mode (renderApp settings registry @10,702,873, evidence/screens/dashboard.md). */}
      <DashboardRow />
      {row("voice_mode", "Voice mode", "Enables speech-to-text in the chat composer. Press Ctrl+Shift+D to start dictating.")}
      <SidebarResourceUsageRow />
      {row(
        "experimental_sidebar_transparency",
        "Sidebar transparency",
        "Use native macOS vibrancy behind the workspace sidebar. Takes effect after you restart OpenConductor.",
      )}
      <GraphiteRow />
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
    <Row
      label="Auto-run after setup"
      help={
        <>
          Start a repository's run script automatically after a new local workspace finishes setup.
          {error && (
            <span className="error small" role="alert">
              {" "}
              {error}
            </span>
          )}
        </>
      }
    >
      <Toggle label="Auto-run after setup" checked={enabled ?? false} disabled={enabled === null} onChange={change} />
    </Row>
  );
}
