// Help › "Submit a prompt": Conductor's `W5a` dialog (sm:max-w-lg p-5; title,
// description; "Prompt" textarea, 5 rows, required, focused; the credit name
// field; "Submit prompt ⌘↵", disabled while the prompt is empty). Submitting
// opens the prompt as a new GitHub issue (see submitPrompt.ts) and closes.
import { useState, type FormEvent } from "react";
import { openUrl } from "../backend";
import { useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import { PRIORITY } from "../keybindings/dispatcher";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import { Modal } from "./Dialogs";
import { SUBMIT_PROMPT_COPY as COPY, SUBMIT_PROMPT_DIALOG_ID, promptSubmissionUrl } from "./submitPrompt";

interface Props {
  appVersion?: string;
  platform?: string;
  onClose: () => void;
}

export function SubmitPromptDialog({ appVersion, platform, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("dialog.primaryAction", overrides)[0];
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    void openUrl(promptSubmissionUrl(prompt, name, appVersion ?? "unknown", platform ?? "unknown"));
    onClose();
  };
  useKeybindings({ "dialog.primaryAction": () => submit() }, { priority: PRIORITY.DIALOG, enableOnDialogIds: [SUBMIT_PROMPT_DIALOG_ID], enableOnInputFocus: true });
  return (
    <Modal title={COPY.title} onClose={onClose} dialogId={SUBMIT_PROMPT_DIALOG_ID}>
      <form className="modal-body submit-prompt-dialog" onSubmit={submit}>
        <p className="submit-prompt-desc">{COPY.description}</p>
        <label className="field">
          <span>{COPY.promptLabel}</span>
          <textarea id="submit-prompt-message" placeholder={COPY.promptPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} required autoFocus />
        </label>
        <label className="field">
          <span>{COPY.nameLabel}</span>
          <input id="submit-prompt-name" type="text" placeholder={COPY.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={!prompt.trim()} data-primary-action>
            {COPY.submit}
            {key && <kbd className="submit-prompt-kbd">{glyphs(key)}</kbd>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
