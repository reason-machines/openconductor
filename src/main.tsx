import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiffWorkerPool } from "./features/diff/DiffWorkerPool";
import { KeybindingsProvider } from "./keybindings/KeybindingsProvider";
import { FirstRunGate } from "./onboarding/FirstRunGate";
import { getSettings } from "./settings/api";
import { overridesRaw } from "./settings/keybindingOverrides";
import { installContextMenuGuard } from "./lib/nativeContextMenu";
import { installPaletteStyles } from "./theme/palettes";
import "./fonts.css";
import "./theme/tokens.css";
import "./styles.css";

const loadOverrides = async () => overridesRaw(await getSettings());

installContextMenuGuard();
installPaletteStyles();

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
