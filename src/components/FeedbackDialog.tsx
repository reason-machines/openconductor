import { useRef, useState, type FormEvent } from "react";
import { openUrl } from "../backend";
import { useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import { PRIORITY } from "../keybindings/dispatcher";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import { useDialogMotion } from "./motion/dialogMotion";
import { FEEDBACK_COPY as COPY, FEEDBACK_DIALOG_ID, openFeedbackDraft } from "./feedback";

type Submission = { kind: "idle" } | { kind: "opening" } | { kind: "error"; message: string };

type Props = {
  appVersion?: string;
  platform?: string;
  onClose: () => void;
};

export function FeedbackDialog({ appVersion, platform, onClose }: Props) {
  const [message, setMessage] = useState("");
  const [submission, setSubmission] = useState<Submission>({ kind: "idle" });
  const inFlight = useRef(false);
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("dialog.primaryAction", overrides)[0];
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (inFlight.current || !message.trim()) return;
    inFlight.current = true;
    setSubmission({ kind: "opening" });
    try {
      const result = await openFeedbackDraft({ message, appVersion, platform, openUrl });
      if (result.kind === "opened") onClose();
      else if (result.kind === "error") setSubmission(result);
      else setSubmission({ kind: "idle" });
    } finally {
      inFlight.current = false;
    }
  };
  useKeybindings({ "dialog.primaryAction": () => { void submit(); } }, { priority: PRIORITY.DIALOG, enableOnDialogIds: [FEEDBACK_DIALOG_ID], enableOnInputFocus: true });
  const motionRef = useDialogMotion<HTMLDivElement>();
  const opening = submission.kind === "opening";
  return (
    <div className="submit-prompt-backdrop" ref={motionRef} data-dialog-motion="dialog" data-dialog-id={FEEDBACK_DIALOG_ID} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="submit-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-description feedback-privacy" onKeyDown={(event) => event.key === "Escape" && onClose()}>
        <div className="submit-prompt-header">
          <h2 id="feedback-title">{COPY.title}</h2>
          <p id="feedback-description">{COPY.description}</p>
        </div>
        <form className="submit-prompt-form" onSubmit={(event) => { void submit(event); }}>
          <div className="submit-prompt-field">
            <label htmlFor="feedback-message">{COPY.messageLabel}</label>
            <textarea id="feedback-message" placeholder={COPY.placeholder} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} required autoFocus disabled={opening} />
          </div>
          <div className="submit-prompt-header"><p id="feedback-privacy">{COPY.privacy}</p></div>
          {submission.kind === "error" && <p role="alert" className="error">{submission.message}</p>}
          <div className="submit-prompt-footer">
            <button type="submit" className="submit-prompt-submit" disabled={!message.trim() || opening} data-primary-action>
              {opening ? COPY.opening : COPY.submit}
              {key && <span className="submit-prompt-kbd">{glyphs(key)}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
