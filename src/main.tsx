import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiffWorkerPool } from "./features/diff/DiffWorkerPool";
import { TooltipProvider } from "./components/ui/Tooltip";
import { KeybindingsProvider } from "./keybindings/KeybindingsProvider";
import { FirstRunGate } from "./onboarding/FirstRunGate";
import { migrateLegacySendKey } from "./keybindings/overrides";
import { getSettings, updateSettings } from "./settings/api";
import { loadAppPrefs } from "./settings/appPrefs";
import { overridesRaw, withOverridesRaw } from "./settings/keybindingOverrides";
import { installContextMenuGuard } from "./lib/nativeContextMenu";
import { installConsoleCapture } from "./diagnostics/consoleLog";
import { agentBinaryStore } from "./features/chat/agentBinaryStore";
import { startCaffeinateConsumer } from "./settings/caffeinateConsumer";
import "./fonts.css";
import "./theme/tokens.css";
import "./styles.css";
import "./scroll.css";
import "./components/motion/motion.css";
import "./components/motion/screens.css";

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

// Diagnostics › "Copy all console logs" copies what the console printed since startup.
installConsoleCapture();
installContextMenuGuard();
// Conductor starts its AgentBinaryStore at launch (renderApp `hRa`): failed downloads retry right away.
void agentBinaryStore.initialize();
// Conductor's dAa: prevent sleep while agents are working (caffeinate_while_agents_running pref).
void startCaffeinateConsumer();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DiffWorkerPool>
      <KeybindingsProvider loadOverrides={loadOverrides}>
        <TooltipProvider>
          <FirstRunGate>
            <App />
          </FirstRunGate>
        </TooltipProvider>
      </KeybindingsProvider>
    </DiffWorkerPool>
  </React.StrictMode>,
);
