import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { addRepository, createNewProject, folderExists, lastCloneDirectory, pickFolder, saveLastCloneDirectory, saveRepoScripts } from "../backend";
import { defaultCloneDirectory } from "../workspace/api";
import { appendLog, initialLocation, logText } from "../state/cloneDialog";
import {
  DEFAULT_PROJECT_NAME, STEP, TEMPLATES, canCreate, createButtonLabel, createFailedMessage, nameHint, projectSlug,
  templateScripts, validateCreate, type TemplateId,
} from "../state/createProject";
import type { Repo } from "../state/types";
import { FileCodeIcon, NextMarkIcon } from "./Icons";
import { Modal } from "./Dialogs";

// "Create project" (Home → Quick start), per evidence/screens/create-project.md.
// gstack stays out of TEMPLATES until the user decides on it.

export type CreatedRepo = Omit<Repo, "id" | "workspaces">;

interface Props {
  onClose: () => void;
  /** Adds the project and its first workspace, then shows the success toast. */
  onCreated: (repo: CreatedRepo, githubUrl: string) => void;
}

const TEMPLATE_ICONS: Record<TemplateId, () => JSX.Element> = {
  empty: () => <FileCodeIcon size={20} />,
  nextjs: () => <NextMarkIcon size={20} />,
};

export function CreateProjectDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState(DEFAULT_PROJECT_NAME);
  const [parent, setParent] = useState("");
  const [template, setTemplate] = useState<TemplateId>("empty");
  const [step, setStep] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Starts at the clone dialog's location: the saved folder if it still exists, else the default.
  useEffect(() => {
    let live = true;
    (async () => {
      const saved = await lastCloneDirectory();
      const exists = saved ? await folderExists(saved) : false;
      const fallback = await defaultCloneDirectory().catch(() => "");
      if (live) setParent((cur) => cur || initialLocation(saved, exists, fallback));
    })();
    return () => {
      live = false;
    };
  }, []);

  const slug = projectSlug(name.trim());
  const hint = nameHint(name);

  async function browse() {
    const picked = await pickFolder("Choose where to create the project");
    if (picked) setParent(picked);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (pending) return;
    setError(null);
    const parentDir = parent.trim();
    const invalid = validateCreate(slug, parentDir);
    if (invalid) return setError(invalid);
    setPending(true);
    setLog([]);
    try {
      const created = await createNewProject({ parentDir, slug, template }, (p) =>
        p.kind === "step" ? setStep(p.text) : setLog((l) => appendLog(l, p.text)),
      );
      setStep(STEP.addProject);
      const registered = await addRepository(created.path);
      const scripts = templateScripts(template);
      if (scripts) await saveRepoScripts(registered.root, scripts);
      setStep(STEP.createWorkspace);
      saveLastCloneDirectory(parentDir);
      setName("");
      setStep(null);
      onCreated({ name: slug, path: registered.root, remote: created.originRemoteUrl, defaultBranch: created.defaultBranch }, created.githubUrl);
      onClose();
    } catch (err) {
      setError(createFailedMessage(err));
      setStep(null);
      setLog([]);
      setPending(false);
    }
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canCreate(slug, parent.trim(), pending)) void submit();
    }
  }

  return (
    <Modal title="Create project" onClose={onClose}>
      <form onSubmit={submit} className="modal-body create-project-dialog">
        <p className="create-project-subtitle">Create a local folder, private GitHub repo, and first workspace.</p>
        <label className="field">
          <span>Project name</span>
          <input
            id="project-name" autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            placeholder="my-awesome-project" value={name} disabled={pending}
            onChange={(e) => setName(e.target.value)} onKeyDown={onNameKey}
          />
          {hint?.kind === "creates" && (
            <span className="create-project-hint">Creates folder and repo <code>{hint.slug}</code></span>
          )}
          {hint?.kind === "invalid" && <span className="create-project-hint invalid">Name must include letters or numbers.</span>}
        </label>
        <label className="field">
          <span>Parent folder</span>
          <div className="field-row">
            <input value={parent} disabled={pending} placeholder="Enter path or click to select" onChange={(e) => setParent(e.target.value)} />
            <button type="button" className="btn" disabled={pending} onClick={() => void browse()}>Browse</button>
          </div>
        </label>
        <div className="field">
          <span>Template</span>
          <div className="create-project-templates" role="radiogroup" aria-label="Template">
            {TEMPLATES.map((t) => (
              <button
                key={t.id} type="button" role="radio" aria-checked={template === t.id} disabled={pending}
                className={template === t.id ? "selected" : ""} onClick={() => setTemplate(t.id)}
              >
                <span className="create-project-template-icon">{TEMPLATE_ICONS[t.id]()}</span>
                <span className="create-project-template-label">{t.label}</span>
                <span className="create-project-template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
        {pending && step && (
          <div className="clone-progress">
            <span className="clone-progress-label"><span className="clone-spinner" aria-hidden />{step}</span>
            {log.length > 0 && <pre className="clone-log">{logText(log)}</pre>}
          </div>
        )}
        {error && <div className="clone-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={!canCreate(slug, parent.trim(), pending)}>
            {createButtonLabel(pending)}
            {!pending && <kbd className="clone-kbd">⌘↵</kbd>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
