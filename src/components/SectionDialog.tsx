import { useEffect, useRef, useState } from "react";
import { Modal } from "./Dialogs";
import { searchSectionEmoji } from "./sectionEmoji";

export { SECTION_EMOJIS } from "./sectionEmoji";

export type SectionDialogMode =
  | { mode: "create"; beforeSectionId?: string; workspaceIdToMove?: string }
  | { mode: "edit"; sectionId: string; name: string; emoji?: string };

interface Props {
  data: SectionDialogMode;
  onSubmit: (value: { name: string; emoji?: string }) => void;
  onClose: () => void;
}

export function SectionDialog({ data, onSubmit, onClose }: Props) {
  const creating = data.mode === "create";
  const [name, setName] = useState(data.mode === "edit" ? data.name : "");
  const [emoji, setEmoji] = useState<string | undefined>(data.mode === "edit" ? data.emoji : undefined);
  const [picking, setPicking] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const composing = useRef(false);
  const compositionEndTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    if (compositionEndTimer.current !== undefined) clearTimeout(compositionEndTimer.current);
  }, []);
  const emojiChoices = searchSectionEmoji(emojiQuery);
  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ name: trimmed, ...(emoji === undefined ? {} : { emoji }) });
    onClose();
  };
  return (
    <Modal title={creating ? "New section" : "Edit section"} onClose={onClose}>
      <div
        className="modal-body section-dialog"
        onCompositionStart={() => {
          clearTimeout(compositionEndTimer.current);
          compositionEndTimer.current = undefined;
          composing.current = true;
        }}
        onCompositionEnd={() => {
          clearTimeout(compositionEndTimer.current);
          const delay = typeof CSS !== "undefined" && CSS.supports?.("-webkit-backdrop-filter:none") ? 5 : 0;
          compositionEndTimer.current = setTimeout(() => {
            compositionEndTimer.current = undefined;
            composing.current = false;
          }, delay);
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" && composing.current) event.stopPropagation();
        }}
      >
        <div className="section-dialog-row">
          <button
            type="button"
            className="section-emoji-btn"
            aria-label={emoji === undefined ? "Choose section emoji" : "Change section emoji"}
            aria-expanded={picking}
            onClick={() => setPicking(!picking)}
          >
            {emoji ?? <span className="section-emoji-placeholder" aria-hidden>☺</span>}
          </button>
          <input
            className="section-name-input"
            aria-label="Section name"
            value={name}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                submit();
              }
            }}
          />
        </div>
        {picking && (
          <div>
            <div className="repo-icon-search">
              <input
                aria-label="Search emoji"
                placeholder="Search emoji"
                value={emojiQuery}
                onChange={(e) => setEmojiQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            {emojiChoices.length === 0 && <p className="muted" role="status">No emoji found</p>}
            <div className="section-emoji-grid" role="listbox" aria-label="Section emoji">
              {emojiChoices.map(({ emoji: e, label }) => (
                <button
                  key={e}
                  type="button"
                  role="option"
                  title={label}
                  aria-selected={e === emoji}
                  className="section-emoji-option"
                  onClick={() => {
                    setEmoji(e);
                    setPicking(false);
                  }}
                >
                  {e}
                </button>
              ))}
              {emoji !== undefined && (
                <button
                  type="button"
                  className="section-emoji-clear"
                  onClick={() => {
                    setEmoji(undefined);
                    setPicking(false);
                  }}
                >
                  Remove emoji
                </button>
              )}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" data-primary-action disabled={!trimmed} onClick={submit}>
            {creating ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
