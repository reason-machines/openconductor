import { useEffect, useState, type FormEvent } from "react";
import { addRepository, createNewProject, folderExists, lastCloneDirectory, pickFolder, saveLastCloneDirectory, saveRepoScripts } from "../backend";
import { defaultCloneDirectory } from "../workspace/api";
import { appendLog, initialLocation, logText } from "../state/cloneDialog";
import {
  DEFAULT_PROJECT_NAME, STEP, TEMPLATES, canCreate, createButtonLabel, createFailedMessage, nameHint, projectSlug,
  templateScripts, validateCreate, type TemplateId,
} from "../state/createProject";
import type { Repo } from "../state/types";
import { createFirstWorkspace, type FirstWorkspaceResult } from "../home/createFirstWorkspace";
import { FileCodeIcon, NextMarkIcon } from "./Icons";
import { DialogFrame } from "./DialogFrame";

// "Create project" (Home → Quick start), per evidence/screens/create-project.md.
// gstack stays out of TEMPLATES until the user decides on it.
// Layout is Conductor 0.87.6's `gbi` on its generic dialog (`nd`, `sm:max-w-[525px]`, read
// with REA from the decoded renderApp chunk @2,108,600): 24px padding, no close button,
// title and subtitle header, then the fields 24px apart, each label 8px above its control.

/** The registered project: its backend id (`add_repository`) plus what the sidebar shows. */
export type CreatedRepo = Omit<Repo, "workspaces">;

interface Props {
  onClose: () => void;
  /** The project is registered ("Adding project..." done); add it under its backend id. */
  onRepoAdded: (repo: CreatedRepo) => void;
  /** The first workspace exists; add and open it, then show the success toast. */
  onCreated: (repoId: string, first: FirstWorkspaceResult, githubUrl: string) => void;
}

const TEMPLATE_ICONS: Record<TemplateId, () => JSX.Element> = {
  empty: () => <FileCodeIcon size={24} strokeWidth={1} />,
  nextjs: () => <NextMarkIcon size={24} />,
};

export function CreateProjectDialog({ onClose, onRepoAdded, onCreated }: Props) {
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
    const picked = await pickFolder("Choose where to create the project", parent);
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
      // Registered without an automatic workspace; Quick start creates the first one itself.
      onRepoAdded({ id: registered.id, name: slug, path: registered.root, remote: created.originRemoteUrl, defaultBranch: created.defaultBranch });
      const scripts = templateScripts(template);
      if (scripts) await saveRepoScripts(registered.root, scripts);
      setStep(STEP.createWorkspace);
      const first = await createFirstWorkspace({ id: registered.id, root: registered.root, defaultBranch: created.defaultBranch });
      saveLastCloneDirectory(parentDir);
      setName("");
      setStep(null);
      onCreated(registered.id, first, created.githubUrl);
      onClose();
    } catch (err) {
      setError(createFailedMessage(err));
      setStep(null);
      setLog([]);
      setPending(false);
    }
  }

  return (
    <DialogFrame kind="dialog" className="create-project-modal" titleId="create-project-title" descriptionId="create-project-description" onClose={onClose}>
      <div className="create-project-header">
        <h2 id="create-project-title">Create project</h2>
        <p id="create-project-description" className="create-project-subtitle">Create a local folder, private GitHub repo, and first workspace.</p>
      </div>
      <form onSubmit={submit} className="create-project-dialog">
        <label className="field">
          <span>Project name</span>
          <input
            id="project-name" autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            placeholder="my-awesome-project" value={name} disabled={pending}
            onChange={(e) => setName(e.target.value)}
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
          <button type="submit" className="btn btn-primary" data-primary-action disabled={!canCreate(slug, parent.trim(), pending)}>
            {createButtonLabel(pending)}
            {!pending && <kbd className="clone-kbd">⌘↵</kbd>}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
