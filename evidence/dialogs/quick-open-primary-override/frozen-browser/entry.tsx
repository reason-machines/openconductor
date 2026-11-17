import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QuickOpenDialog } from '../../src/components/QuickOpenDialog';
import { KeybindingsProvider, useKeybindingOverrides } from '../../src/keybindings/KeybindingsProvider';
import { effectiveShortcuts } from '../../src/keybindings/overrides';
import { witness, scenario } from './io';
import './fixture.css';

const custom = { 'dialog.primaryAction': [{ key: { kind: 'logical', value: 'd' }, modifiers: ['meta'] }] };
const overrides = scenario === 'default' ? {} : scenario === 'physical'
  ? { 'dialog.primaryAction': [{ key: { kind: 'physical', code: 'KeyD', display: 'D' }, modifiers: ['alt'] }] }
  : scenario === 'additional'
    ? { 'dialog.primaryAction': [custom['dialog.primaryAction'][0], { key: { kind: 'logical', value: 'y' }, modifiers: ['ctrl', 'shift'] }] }
    : custom;
function publish() {
  const target = document.getElementById('trace');
  if (target) target.textContent = JSON.stringify(witness, null, 2);
}
for (const type of ['keydown', 'keyup', 'click']) document.addEventListener(type, event => {
  const target = event.target as HTMLElement;
  const key = event as KeyboardEvent;
  queueMicrotask(() => {
    witness.events.push({ type, trusted: event.isTrusted, tag: target?.tagName, id: target?.id, key: key.key, code: key.code, meta: key.metaKey, ctrl: key.ctrlKey, shift: key.shiftKey, alt: key.altKey, defaultPrevented: event.defaultPrevented });
    publish();
  });
}, true);
window.addEventListener('error', event => { witness.errors.push(event.message); publish(); });
window.addEventListener('unhandledrejection', event => { witness.errors.push(String(event.reason)); publish(); });
function Actual() {
  const [closed, setClosed] = useState(false);
  const { overrides: current, overridesLoaded } = useKeybindingOverrides();
  witness.shortcuts = effectiveShortcuts('dialog.primaryAction', current);
  witness.ready = overridesLoaded;
  return closed ? <p className="closed">Quick open closed after one captured selection.</p> : <QuickOpenDialog
    repoId={`synthetic-${document.documentElement.dataset.build}-${scenario}`}
    workspacePath="/synthetic"
    onOpen={(path, mode) => { witness.opens.push({ path, mode }); publish(); }}
    onClose={() => { witness.closed++; setClosed(true); publish(); }}
  />;
}
function App() {
  return <><h1>Quick open — {document.documentElement.dataset.build}</h1>
    <p>Synthetic files only. Actual component and keybinding context; no application, native, provider or backend runtime.</p>
    <KeybindingsProvider loadOverrides={async () => JSON.stringify({ version: 1, overrides })}><Actual /></KeybindingsProvider>
    <h2>Observed trace</h2><pre id="trace" aria-label="Witness trace" />
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
setTimeout(publish, 100);
Object.defineProperty(window, '__quickOpenWitness', { value: { read: () => structuredClone(witness) } });
