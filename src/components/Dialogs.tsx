import { useState, type Dispatch, type FormEvent, type ReactNode } from "react";
import type { Action } from "../state/store";
import { CloseIcon } from "./Icons";

export type DialogKind = "clone" | "quickstart" | "create";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface DialogProps {
  onClose: () => void;
  dispatch: Dispatch<Action>;
}

const TEMPLATES = [
  { id: "empty", name: "Empty repository", body: "README and .gitignore only." },
  { id: "web", name: "Web app", body: "Vite + TypeScript starter." },
  { id: "cli", name: "Command-line tool", body: "Minimal Rust or Node CLI." },
];

export function QuickStartDialog({ onClose, dispatch }: DialogProps) {
  const [name, setName] = useState("my-project");
  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const valid = /^[\w.-]+$/.test(name.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    dispatch({ type: "addRepo", repo: { name: name.trim(), path: `~/openconductor/${name.trim()}`, defaultBranch: "main" } });
    onClose();
  }

  return (
    <Modal title="Quick start" onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <label className="field">
          <span>Project name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} />
        </label>
        <fieldset className="templates">
          <legend>Template</legend>
          {TEMPLATES.map((t) => (
            <label key={t.id} className={`template ${template === t.id ? "selected" : ""}`}>
              <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} />
              <span className="template-name">{t.name}</span>
              <span className="muted small">{t.body}</span>
            </label>
          ))}
        </fieldset>
        <p className="muted small">Placeholder templates: what the reference app's quick start creates is still an open evidence item.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
