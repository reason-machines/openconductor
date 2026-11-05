// Settings rows for the app preferences in conductor.db's settings table, with
// Conductor's titles and descriptions (renderApp settings registry, see
// evidence/settings/NOTES.md "App preferences in the settings table").
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Row } from "../GeneralPage";
import { setAppPref, useAppPrefs, type AppPrefUpdate } from "../appPrefs";
import { effectiveShortcuts } from "../../keybindings/overrides";
import { glyphs } from "../../keybindings/shortcut";

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

/** Experimental: New workspace page, Show agent cost, Tab Freak Mode, Show sidebar resource usage, Graphite stack support. */
export function ExperimentalAppPrefRows() {
  const p = useAppPrefs();
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
      <Row label="New workspace page" help="Full-screen workspace creation">
        <Switch
          label="New workspace page"
          checked={p.experimental_new_workspace_page}
          onChange={(value) => save({ key: "experimental_new_workspace_page", value })}
        />
      </Row>
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
      {/* Conductor's `sidebar_resource_usage` row (renderApp settings registry, experimental tab). */}
      <Row label="Show sidebar resource usage" help="Shows CPU and memory usage in the workspace sidebar footer.">
        <Switch
          label="Show sidebar resource usage"
          checked={p.sidebar_resource_usage}
          onChange={(value) => save({ key: "sidebar_resource_usage", value })}
        />
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
