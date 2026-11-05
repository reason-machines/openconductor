import { useEffect, useState } from "react";
import { monoFontError, withAppearance } from "./appearance";
import { Row } from "./GeneralPage";
import type { Settings } from "./types";
import {
  terminalFontFamily,
  terminalFontSize,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_LINE_HEIGHT,
} from "../features/terminal/font";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › Appearance › Terminal font: Conductor's Terminal Font input
 * ("Leave empty for default"), Terminal Font Size slider (10-20 px) and a
 * preview in that font (evidence/terminal/NOTES.md). Saves reach open
 * terminals at once through applyAppearance.
 */
export function TerminalFontRows({ settings, save }: Props) {
  const saved = settings.appearance.terminal_font_family ?? "";
  const size = terminalFontSize(settings.appearance.terminal_font_size);
  const [family, setFamily] = useState(saved);
  useEffect(() => setFamily(saved), [saved]);
  const error = family.trim() === "" ? null : monoFontError(family);

  const commitFamily = () => {
    const next = family.trim();
    if (error !== null || next === saved) return;
    save(withAppearance(settings, "terminal_font_family", next === "" ? null : next));
  };

  return (
    <>
      <Row label="Terminal Font" help="Font family and size for the terminal.">
        <input
          type="text"
          aria-label="Terminal Font"
          aria-invalid={error !== null}
          placeholder="Leave empty for default"
          spellCheck={false}
          autoComplete="off"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          onBlur={commitFamily}
          onKeyDown={(e) => e.key === "Enter" && commitFamily()}
        />
      </Row>
      <div className="settings-radio-detail">
        <p className={error ? "error small" : "muted small"}>
          {error ?? "Enter font name exactly as installed, e.g. Arial, Papyrus, FiraCode Nerd Font"}
        </p>
      </div>
      <Row label="Terminal Font Size" help={`${size}px`}>
        <input
          type="range"
          aria-label="Terminal Font Size"
          min={TERMINAL_FONT_SIZE_MIN}
          max={TERMINAL_FONT_SIZE_MAX}
          step={1}
          value={size}
          onChange={(e) => save(withAppearance(settings, "terminal_font_size", Number(e.target.value)))}
        />
      </Row>
      <div
        className="settings-terminal-preview"
        aria-label="Terminal font preview"
        style={{ fontFamily: terminalFontFamily(error === null ? family : saved), fontSize: `${size}px`, lineHeight: TERMINAL_LINE_HEIGHT }}
      >
        <div>~/project main ±3 ?2</div>
        <div>❯ npm test ✓</div>
        <div>└── ▶ All tests passed!</div>
      </div>
    </>
  );
}
