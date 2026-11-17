import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreateProjectDialog } from '../../src/components/CreateProjectDialog';
import { KeybindingsProvider, useKeybindingOverrides } from '../../src/keybindings/KeybindingsProvider';
import { effectiveShortcuts } from '../../src/keybindings/overrides';
import { witness } from './io';
import './fixture.css';

const mode = new URLSearchParams(location.search).get('mode') ?? 'actual';
const root = createRoot(document.getElementById('root')!);
function publish() {
  const pre = document.getElementById('trace');
  if (pre) pre.textContent = JSON.stringify(witness, null, 2);
}
for (const type of ['keydown', 'keyup', 'click', 'submit']) document.addEventListener(type, event => {
  const target = event.target as HTMLElement;
  const keyboard = event as KeyboardEvent;
  queueMicrotask(() => {
    witness.events.push({ type, trusted: event.isTrusted, tag: target?.tagName, id: target?.id, key: keyboard.key, meta: keyboard.metaKey, ctrl: keyboard.ctrlKey, defaultPrevented: event.defaultPrevented });
    publish();
  });
}, true);
window.addEventListener('error', event => { witness.errors.push(event.message); publish(); });
window.addEventListener('unhandledrejection', event => { witness.errors.push(String(event.reason)); publish(); });
function Actual() {
  const [open, setOpen] = useState(true);
  const { overrides } = useKeybindingOverrides();
  witness.shortcuts = effectiveShortcuts('dialog.primaryAction', overrides);
  return open ? <CreateProjectDialog onClose={() => { witness.closed++; setOpen(false); publish(); }} onRepoAdded={() => { throw new Error('No repository is added'); }} onCreated={() => { witness.completed++; publish(); }} /> : <p>Closed</p>;
}
function App() {
  return <><h1>Create project keyboard witness</h1><p className="scope">Synthetic data; backend and workspace services replaced; no files, GitHub, provider or app runtime.</p>
    {mode === 'capability' ? <form onSubmit={event => { event.preventDefault(); witness.capabilitySubmits++; publish(); }}><label>Capability name<input id="cap-name" defaultValue="fixture-project" /></label><label>Capability parent<input id="cap-parent" defaultValue="/synthetic/project-root" /></label><button id="cap-submit" type="submit">Capability submit</button></form> : <KeybindingsProvider><Actual /></KeybindingsProvider>}
    <pre id="trace" aria-label="Witness trace" />
  </>;
}
root.render(<App />);
setTimeout(publish, 100);
Object.defineProperty(window, '__projectWitness', { value: { read: () => structuredClone(witness) } });
