import { useEffect, useState } from "react";
import { pickFolder } from "../backend";
import { Modal } from "../components/Dialogs";
import { Row } from "./GeneralPage";
import { FolderIcon } from "./icons";
import { errorText } from "./api";
import {
  CHANGE_BODY,
  CHANGE_TITLE,
  ROOT_DESCRIPTION,
  ROOT_TITLE,
  ROOT_WARNING,
  changeConductorRoot,
  conductorRoot,
  isRootChange,
} from "./rootPath";

/**
 * Settings › Advanced › root directory, as Conductor's `advanced:conductor-root`
 * row: the root read-only with Browse; a different folder opens "Change root
 * path?", and confirming forgets every repo, workspace and chat and restarts
 * the app on the new root (Conductor reloads in place and goes to `/`).
 */
export function RootPathRow() {
  const [root, setRoot] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    conductorRoot().then(setRoot, (e) => setError(errorText(e)));
  }, []);

  const browse = async () => {
    const picked = await pickFolder("Select OpenConductor root directory");
    if (isRootChange(root, picked)) setPending(picked);
  };
  const confirm = () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    changeConductorRoot(pending).then(
      (saved) => {
        setRoot(saved);
        setPending(null);
        setBusy(false);
      },
      (e) => {
        setError(`Failed to change root path: ${errorText(e)}`);
        setBusy(false);
      },
    );
  };

  return (
    <>
      <Row
        label={ROOT_TITLE}
        help={
          <>
            <p>{ROOT_DESCRIPTION}</p>
            <p>{ROOT_WARNING}</p>
          </>
        }
        stacked
      >
        <span className="settings-field-wrap">
          <input type="text" aria-label={ROOT_TITLE} readOnly value={root ?? ""} className="settings-field" />
          <button type="button" className="btn settings-outline" onClick={() => void browse()}>
            <FolderIcon />
            Browse
          </button>
        </span>
      </Row>
      {error && !pending && <p className="error small" role="alert">{error}</p>}
      {pending && (
        <Modal title={CHANGE_TITLE} onClose={() => !busy && setPending(null)}>
          <div className="modal-body">
            <p>{CHANGE_BODY}</p>
            <p className="small">
              <span className="muted">Old root path:</span> <code>{root}</code>
            </p>
            <p className="small">
              <span className="muted">New root path:</span> <code>{pending}</code>
            </p>
            {error && <p className="error small" role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy} data-primary-action>
                {busy ? "Changing..." : "Remove all and change"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
