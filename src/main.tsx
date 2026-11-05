import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { KeybindingsProvider } from "./keybindings/KeybindingsProvider";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <KeybindingsProvider>
      <App />
    </KeybindingsProvider>
  </React.StrictMode>,
);
