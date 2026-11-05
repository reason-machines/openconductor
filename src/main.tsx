import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { KeybindingsProvider } from "./keybindings/KeybindingsProvider";
import { getSettings } from "./settings/api";
import { overridesRaw } from "./settings/keybindingOverrides";
import "./fonts.css";
import "./styles.css";

const loadOverrides = async () => overridesRaw(await getSettings());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <KeybindingsProvider loadOverrides={loadOverrides}>
      <App />
    </KeybindingsProvider>
  </React.StrictMode>,
);
