import { useState } from "react";
import { Modal } from "./Dialogs";

// New / Edit section dialog, after Conductor's `Tya` (renderApp chunk,
// REA-decoded, read as data): title "New section" or "Edit section", an emoji
// button beside the name field, Cancel and Create / Save. Enter submits; the
// primary button is disabled while the trimmed name is empty. Conductor's
// emoji button opens its full searchable emoji picker; this one offers a short
// fixed set.

export const SECTION_EMOJIS = [
  "🔥", "🚀", "⭐", "✅", "🐛", "🧪", "🛠️", "📦", "🎨", "📝",
  "💡", "🔒", "⚡", "🌱", "🧹", "📌", "🎯", "🧭", "🏗️", "🔍",
] as const;

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
  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ name: trimmed, ...(emoji === undefined ? {} : { emoji }) });
    onClose();
  };
  return (
    <Modal title={creating ? "New section" : "Edit section"} onClose={onClose}>
      <div className="modal-body section-dialog">
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
          <div className="section-emoji-grid" role="listbox" aria-label="Section emoji">
            {SECTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="option"
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
