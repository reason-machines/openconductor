import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiffWorkerPool } from "./features/diff/DiffWorkerPool";
import { KeybindingsProvider } from "./keybindings/KeybindingsProvider";
import { FirstRunGate } from "./onboarding/FirstRunGate";
import { migrateLegacySendKey } from "./keybindings/overrides";
import { getSettings, updateSettings } from "./settings/api";
import { loadAppPrefs } from "./settings/appPrefs";
import { overridesRaw, withOverridesRaw } from "./settings/keybindingOverrides";
import { installContextMenuGuard } from "./lib/nativeContextMenu";
import "./fonts.css";
import "./styles.css";

// Conductor's startup migration: a legacy "Send messages with" of ⌘ Enter
// fills each send command that has no override with the ⌘ Enter preset.
const loadOverrides = async () => {
  const settings = await getSettings();
  const raw = overridesRaw(settings);
  const legacy = (await loadAppPrefs().catch(() => undefined))?.message_send_key;
  const migrated = migrateLegacySendKey(raw, legacy);
  if (migrated === raw || migrated === undefined) return raw;
  await updateSettings(withOverridesRaw(settings, migrated)).catch((err) => console.warn("Failed to migrate legacy message send key", err));
  return migrated;
};

installContextMenuGuard();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DiffWorkerPool>
      <KeybindingsProvider loadOverrides={loadOverrides}>
        <FirstRunGate>
          <App />
        </FirstRunGate>
      </KeybindingsProvider>
    </DiffWorkerPool>
  </React.StrictMode>,
);
