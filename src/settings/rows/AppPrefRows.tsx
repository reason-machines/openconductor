// Settings rows for the app preferences in conductor.db's settings table, with
// Conductor's titles and descriptions (renderApp settings registry, see
// evidence/settings/NOTES.md "App preferences in the settings table").
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Row } from "../GeneralPage";
import { setAppPref, useAppPrefs, type AppPrefUpdate } from "../appPrefs";
import { effectiveShortcuts } from "../../keybindings/overrides";
import { glyphs } from "../../keybindings/shortcut";
import { setDashboardEnabled, useDashboardEnabled } from "../../home/useDashboardEnabled";

function save(update: AppPrefUpdate): void {
  setAppPref(update).catch((err) => console.warn(`could not save ${update.key}`, err));
}

function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

const GARRY_HINT = effectiveShortcuts("toggleGarryMode").map(glyphs).join(" or ");

/** General: Don't collapse tool calls (Garry Mode). */
export function GeneralAppPrefRows() {
  const p = useAppPrefs();
  return (
    <Row
      label="Don't collapse tool calls (Garry Mode)"
      help={`Show all tool calls expanded by default instead of collapsed. Toggle with ${GARRY_HINT}.`}
    >
      <Switch label="Don't collapse tool calls (Garry Mode)" checked={p.garry_mode} onChange={(value) => save({ key: "garry_mode", value })} />
    </Row>
  );
}

/** Whether the Graphite CLI (`gt`) is on PATH; null while unknown. */
function useGraphiteInstalled(): boolean | null {
  const [installed, setInstalled] = useState<boolean | null>(isTauri() ? null : false);
  useEffect(() => {
    if (!isTauri()) return;
    invoke<boolean>("graphite_cli_installed")
      .then(setInstalled)
      .catch(() => setInstalled(false));
  }, []);
  return installed;
}

/** Experimental: Show agent cost, Tab Freak Mode, Dashboard, Graphite stack support. */
export function ExperimentalAppPrefRows() {
  const p = useAppPrefs();
  const dashboard = useDashboardEnabled();
  const gt = useGraphiteInstalled();
  const graphiteHelp = [
    "Detect Graphite stacks for the active local workspace and show stack-aware UI in the git panel. Cloud workspaces are unaffected. When off, OpenConductor never runs the gt CLI.",
    gt === false ? "Install gt to enable." : "",
    "Warning: appears to sometimes cause performance issues",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <Row label="Show agent cost" help="Show estimated agent costs for cloud workspaces.">
        <Switch
          label="Show agent cost"
          checked={p.experimental_show_agent_cost}
          onChange={(value) => save({ key: "experimental_show_agent_cost", value })}
        />
      </Row>
      <Row label="Tab Freak Mode" help="Allow up to 10 chat and terminal tabs per workspace.">
        <Switch
          label="Tab Freak Mode"
          checked={p.experimental_tab_freak_mode}
          onChange={(value) => save({ key: "experimental_tab_freak_mode", value })}
        />
      </Row>
      {/* Conductor lists Dashboard after Auto-run after setup and before Graphite (renderApp settings registry @10,702,873). */}
      <Row label="Dashboard" help="Show the dashboard and workspace sidebar.">
        <Switch label="Dashboard" checked={dashboard.enabled} disabled={!dashboard.ready} onChange={setDashboardEnabled} />
      </Row>
      <Row label="Graphite stack support" help={graphiteHelp}>
        <Switch
          label="Graphite stack support"
          checked={gt === true && !p.graphite_disabled}
          disabled={gt !== true}
          onChange={(on) => save({ key: "graphite_disabled", value: !on })}
        />
      </Row>
    </>
  );
}
