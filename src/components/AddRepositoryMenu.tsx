import { useState } from "react";
import type { Repo } from "../state/types";
import { inTauri, pickFolder } from "../backend";
import { cloneRepository, type RepositoryDto } from "../workspace/api";
import {
  CLONE_DESTINATION_TITLE,
  CLONE_PLACEHOLDER,
  CLONING,
  INVALID_CLONE_URL,
  cloneFailedMessage,
  parseCloneUrl,
  type CloneSource,
} from "../workspace/repoPicker";

interface Props {
  /** Unused: a remote that is already added is cloned again as a new project, like Conductor (evidence/screens/duplicate-repo.md). */
  repos: Repo[];
  disabled?: boolean;
  /** Label of the closed button: "Add…" next to the picker, "Add repository" when there are none. */
  label: string;
  primary?: boolean;
  onOpenProject: () => void;
  onCloned: (repo: RepositoryDto, source: CloneSource) => void;
  onBusyChange?: (busy: boolean) => void;
}

type Mode = { kind: "closed" } | { kind: "menu" } | { kind: "clone"; status: "idle" | "cloning"; error?: string };

// Outside the desktop app there is no folder picker; clones "land" here.
const BROWSER_CLONE_PARENT = "~/code";

/** "Add repository" in the create dialog: Open project, or Clone repo from a pasted URL. */
export function AddRepositoryMenu({ disabled, label, primary, onOpenProject, onCloned, onBusyChange }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [url, setUrl] = useState("");
  const cloning = mode.kind === "clone" && mode.status === "cloning";

  function setCloning(on: boolean, error?: string) {
    setMode({ kind: "clone", status: on ? "cloning" : "idle", error });
    onBusyChange?.(on);
  }

  async function clone() {
    if (cloning) return;
    const source = parseCloneUrl(url);
    if (!source) return setMode({ kind: "clone", status: "idle", error: INVALID_CLONE_URL });
    const parent = inTauri() ? await pickFolder(CLONE_DESTINATION_TITLE) : BROWSER_CLONE_PARENT;
    if (!parent) return;
    setCloning(true);
    try {
      const repo = await cloneRepository(source.url, parent, source.name);
      onBusyChange?.(false);
      setMode({ kind: "closed" });
      setUrl("");
      onCloned(repo, source);
    } catch (err) {
      setCloning(false, cloneFailedMessage(err));
    }
  }

  return (
    <div className="add-repo">
      <button
        type="button"
        className={`btn ${primary ? "btn-primary" : "btn-small"}`}
        aria-haspopup="menu"
        aria-expanded={mode.kind !== "closed"}
        disabled={disabled || cloning}
        onClick={() => setMode(mode.kind === "menu" ? { kind: "closed" } : { kind: "menu" })}
      >
        {label}
      </button>
      {mode.kind === "clone" && (
      <div className="add-repo-pop add-repo-clone" onKeyDown={(e) => e.key === "Escape" && !cloning && (e.stopPropagation(), setMode({ kind: "closed" }))}>
        <div className="field-row">
          <input
            autoFocus
            value={url}
            placeholder={CLONE_PLACEHOLDER}
            aria-label="Clone URL"
            aria-invalid={!!mode.error}
            disabled={cloning}
            onChange={(e) => {
              setUrl(e.target.value);
              if (mode.error) setMode({ kind: "clone", status: "idle" });
            }}
            onKeyDown={(e) => {
              // Enter clones; it must not submit the surrounding create form.
              if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              void clone();
            }}
          />
          <button type="button" className="btn btn-small btn-primary" onClick={() => void clone()} disabled={cloning || !url.trim()}>
            {cloning ? "Cloning..." : "Clone"}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setMode({ kind: "closed" })} disabled={cloning}>Cancel</button>
        </div>
        {mode.error ? (
          <span className="error small" role="alert">{mode.error}</span>
        ) : cloning ? (
          <span className="muted small" role="status">{CLONING}</span>
        ) : null}
      </div>
      )}
      {mode.kind === "menu" && (
        <div className="add-repo-pop add-repo-menu" role="menu" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setMode({ kind: "closed" }))}>
          <button type="button" role="menuitem" autoFocus onClick={() => (setMode({ kind: "closed" }), onOpenProject())}>Open project</button>
          <button type="button" role="menuitem" onClick={() => setMode({ kind: "clone", status: "idle" })}>Clone repo</button>
        </div>
      )}
    </div>
  );
}
