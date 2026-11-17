import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SubmitPromptDialog } from "../../../../src/components/SubmitPromptDialog";
import { KeybindingsProvider } from "../../../../src/keybindings/KeybindingsProvider";
import * as io from "./io";
import "../../../../src/theme/tokens.css";
import "../../../../src/styles.css";
import "./fixture.css";

const custom = new URLSearchParams(location.search).get("shortcut") === "custom";
const overrides = custom ? { "dialog.primaryAction": [{ key: { kind: "logical", value: "d" }, modifiers: ["meta"] }] } : {};
const events: { type: string; trusted: boolean; target: string }[] = [];
for (const name of ["click", "submit"]) document.addEventListener(name, event => {
  const target = event.target as HTMLElement;
  events.push({ type: name, trusted: event.isTrusted, target: target.id || target.className || target.tagName });
}, true);
function App() {
  const [open, setOpen] = useState(true);
  return <KeybindingsProvider loadOverrides={async () => JSON.stringify({ version: 1, overrides })}>
    <aside className="fixture-controls" aria-label="Synthetic opener controls">
      <span>Inert Submit prompt witness · {document.documentElement.dataset.build} · {custom ? "custom ⌘D" : "default ⌘↵"}</span>
      <button id="fixture-reject" onClick={() => io.settle("reject")}>Reject opener</button>
      <button id="fixture-resolve" onClick={() => io.settle("resolve")}>Resolve opener</button>
    </aside>
    {open && <SubmitPromptDialog appVersion="0.test" platform="synthetic" onClose={() => { io.closed(); setOpen(false); }} />}
  </KeybindingsProvider>;
}
Object.assign(window, { submitHintWitness: () => ({
  build: document.documentElement.dataset.build, custom,
  requests: io.requests.map(({ url }) => ({ url })), closes: io.closes, errors: [...io.errors], events: [...events],
  prompt: (document.querySelector("#submit-prompt-message") as HTMLTextAreaElement | null)?.value ?? null,
  name: (document.querySelector("#submit-prompt-name") as HTMLInputElement | null)?.value ?? null,
  promptDisabled: (document.querySelector("#submit-prompt-message") as HTMLTextAreaElement | null)?.disabled ?? null,
  nameDisabled: (document.querySelector("#submit-prompt-name") as HTMLInputElement | null)?.disabled ?? null,
  hint: document.querySelector(".submit-prompt-kbd")?.textContent ?? null,
  button: document.querySelector(".submit-prompt-submit")?.textContent ?? null,
  buttonDisabled: (document.querySelector(".submit-prompt-submit") as HTMLButtonElement | null)?.disabled ?? null,
  dialog: !!document.querySelector('[role="dialog"]'), alert: document.querySelector('[role="alert"]')?.textContent ?? null,
}) });
createRoot(document.getElementById("root")!).render(<App />);
