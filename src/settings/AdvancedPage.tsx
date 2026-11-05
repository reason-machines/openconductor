import { useEffect, useState } from "react";
import { Row } from "./GeneralPage";
import type { Settings } from "./types";
import { scrollbackBytesFromMegabytes, scrollbackLimitBytes, scrollbackLimitMegabytes } from "../features/terminal/scrollback";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › More › Advanced. Conductor's tab also has Claude Code and Codex
 * executable paths, SSH key path, remote execution and file-sync rows; only
 * Scrollback limit is built (evidence/terminal/NOTES.md). The field is in
 * whole MB, saved as bytes on Enter or blur, and redrawn with the value kept,
 * as Conductor's is. Open terminals take a change at once through applyAppearance.
 */
export function AdvancedPage({ settings, save }: Props) {
  const stored = settings.advanced?.terminal_scrollback_limit_bytes;
  const shown = String(scrollbackLimitMegabytes(stored));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const commit = () => {
    const bytes = scrollbackBytesFromMegabytes(text);
    setText(String(scrollbackLimitMegabytes(bytes)));
    if (bytes !== scrollbackLimitBytes(stored)) {
      save({ ...settings, advanced: { ...settings.advanced, terminal_scrollback_limit_bytes: bytes } });
    }
  };

  return (
    <Row label="Scrollback limit" help="Approximate terminal output to keep.">
      <span className="settings-inline">
        <input
          type="number"
          aria-label="Scrollback limit"
          min={1}
          step={1}
          className="settings-number"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="muted small">MB</span>
      </span>
    </Row>
  );
}
