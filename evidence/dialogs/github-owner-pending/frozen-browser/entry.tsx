import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { GitHubRepoDialog } from "../../../../src/components/GitHubRepoDialog";
import { KeybindingsProvider } from "../../../../src/keybindings/KeybindingsProvider";
import * as io from "./io";
import "../../../../src/theme/tokens.css";
import "../../../../src/styles.css";
import "./fixture.css";
const events: { type: string; trusted: boolean; target: string }[] = [];
for (const type of ["click", "change", "submit"]) document.addEventListener(type, event => {
  const target = event.target as HTMLElement;
  events.push({ type, trusted: event.isTrusted, target: target.id || target.tagName });
}, true);
function App() {
  const [open, setOpen] = useState(true);
  return <KeybindingsProvider loadOverrides={async () => JSON.stringify({ version: 1, overrides: {} })}>
    {open && <GitHubRepoDialog target={{ path: "/synthetic/project", name: "Notes", needsGitInit: false, existingOriginUrl: "https://example.invalid/original.git" }}
      onClose={() => { io.closed(); setOpen(false); }} onOpenSettings={() => { throw Error("Unexpected settings navigation"); }}
      onCreated={async url => { io.added.push(url); }} onError={message => io.errors.push(message)} />}
  </KeybindingsProvider>;
}
Object.assign(window, { ownerWitness: () => {
  const select = document.querySelector("select");
  const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  return { build: document.documentElement.dataset.build, owner: select?.value ?? null, ownerDisabled: select?.disabled ?? null,
    options: select ? [...select.options].map(option => ({ value: option.value, label: option.text })) : [],
    submit: submit?.textContent ?? null, submitDisabled: submit?.disabled ?? null,
    requests: io.requests.map(request => ({ ...request.args })), checks: [...io.checks], added: [...io.added], errors: [...io.errors], closes: io.closes,
    dialog: !!document.querySelector('[role="alertdialog"]'), events: [...events] };
} });
createRoot(document.getElementById("root")!).render(<App />);
