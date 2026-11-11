import { useRef, useState, type FormEvent } from "react";
import { openUrl } from "../backend";
import { useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import { PRIORITY } from "../keybindings/dispatcher";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import { useDialogMotion } from "./motion/dialogMotion";
import { SUBMIT_PROMPT_COPY as COPY, SUBMIT_PROMPT_DIALOG_ID, promptSubmissionUrl } from "./submitPrompt";

type Submission = { kind: "idle" } | { kind: "opening" } | { kind: "error" };

interface Props {
  appVersion?: string;
  platform?: string;
  onClose: () => void;
}

export function SubmitPromptDialog({ appVersion, platform, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [submission, setSubmission] = useState<Submission>({ kind: "idle" });
  const inFlight = useRef(false);
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("dialog.primaryAction", overrides)[0];
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (inFlight.current || !prompt.trim()) return;
    inFlight.current = true;
    setSubmission({ kind: "opening" });
    try {
      await openUrl(promptSubmissionUrl(prompt, name, appVersion ?? "unknown", platform ?? "unknown"));
      onClose();
    } catch {
      setSubmission({ kind: "error" });
    } finally {
      inFlight.current = false;
    }
  };
  useKeybindings({ "dialog.primaryAction": () => { void submit(); } }, { priority: PRIORITY.DIALOG, enableOnDialogIds: [SUBMIT_PROMPT_DIALOG_ID], enableOnInputFocus: true });
  const motionRef = useDialogMotion<HTMLDivElement>();
  const opening = submission.kind === "opening";
  return (
    <div className="submit-prompt-backdrop" ref={motionRef} data-dialog-motion="dialog" data-dialog-id={SUBMIT_PROMPT_DIALOG_ID} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="submit-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-prompt-title" aria-describedby="submit-prompt-desc" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="submit-prompt-header">
          <h2 id="submit-prompt-title">{COPY.title}</h2>
          <p id="submit-prompt-desc">{COPY.description}</p>
        </div>
        <form className="submit-prompt-form" onSubmit={(e) => { void submit(e); }}>
          <div className="submit-prompt-field">
            <label htmlFor="submit-prompt-message">{COPY.promptLabel}</label>
            <textarea id="submit-prompt-message" placeholder={COPY.promptPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} required autoFocus disabled={opening} />
          </div>
          <div className="submit-prompt-field">
            <label htmlFor="submit-prompt-name">{COPY.nameLabel}</label>
            <input id="submit-prompt-name" type="text" placeholder={COPY.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} disabled={opening} />
          </div>
          {submission.kind === "error" && <p role="alert" className="error">Failed to submit prompt. Please try again later.</p>}
          <div className="submit-prompt-footer">
            <button type="submit" className="submit-prompt-submit" disabled={!prompt.trim() || opening} data-primary-action>
              {opening ? "Submitting..." : COPY.submit}
              {key && <span className="submit-prompt-kbd">{glyphs(key)}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
