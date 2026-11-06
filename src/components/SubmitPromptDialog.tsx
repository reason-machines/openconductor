// Help › "Submit a prompt": Conductor's `W5a` dialog in its DialogContent `nd`
// (top-anchored at max(2rem, 50% - 250px), rounded-md border bg-background,
// sm:max-w-lg p-5, gap-4, no close button), header `Hd` (title `Bu` text-xl
// font-medium leading-none, description `wg` muted), "Prompt" textarea `wS`
// (5 rows, required, focused), the credit name input `Qo` (h-8), and footer
// `km` with "Submit prompt ⌘↵", disabled while the prompt is empty. Escape or a
// click outside closes it. Submitting opens the prompt as a new GitHub issue
// (see submitPrompt.ts) and closes.
import { useState, type FormEvent } from "react";
import { openUrl } from "../backend";
import { useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import { PRIORITY } from "../keybindings/dispatcher";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import { useDialogMotion } from "./motion/dialogMotion";
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
  const motionRef = useDialogMotion<HTMLDivElement>();
  return (
    <div className="submit-prompt-backdrop" ref={motionRef} data-dialog-motion="dialog" data-dialog-id={SUBMIT_PROMPT_DIALOG_ID} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="submit-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-prompt-title" aria-describedby="submit-prompt-desc" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="submit-prompt-header">
          <h2 id="submit-prompt-title">{COPY.title}</h2>
          <p id="submit-prompt-desc">{COPY.description}</p>
        </div>
        <form className="submit-prompt-form" onSubmit={submit}>
          <div className="submit-prompt-field">
            <label htmlFor="submit-prompt-message">{COPY.promptLabel}</label>
            <textarea id="submit-prompt-message" placeholder={COPY.promptPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} required autoFocus />
          </div>
          <div className="submit-prompt-field">
            <label htmlFor="submit-prompt-name">{COPY.nameLabel}</label>
            <input id="submit-prompt-name" type="text" placeholder={COPY.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="submit-prompt-footer">
            <button type="submit" className="submit-prompt-submit" disabled={!prompt.trim()} data-primary-action>
              {COPY.submit}
              {key && <span className="submit-prompt-kbd">{glyphs(key)}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
