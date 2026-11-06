import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiffWorkerPool } from "./features/diff/DiffWorkerPool";
import { KeybindingsProvider } from "./keybindings/KeybindingsProvider";
import { FirstRunGate } from "./onboarding/FirstRunGate";
import { getSettings } from "./settings/api";
import { overridesRaw } from "./settings/keybindingOverrides";
import { installContextMenuGuard } from "./lib/nativeContextMenu";
import "./fonts.css";
import "./styles.css";
import "./components/motion/motion.css";

const loadOverrides = async () => overridesRaw(await getSettings());

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
