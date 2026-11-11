import { useEffect, useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { monoFontError, withAppearance } from "./appearance";
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
    <div className="settings-terminal-font" data-settings-row>
      <label className="settings-row-label" htmlFor="terminal-font">
        Terminal Font
      </label>
      <input
        id="terminal-font"
        type="text"
        className="settings-field"
        aria-label="Terminal Font"
        aria-invalid={error !== null}
        placeholder="Leave empty for default"
        spellCheck={false}
        autoComplete="off"
        value={family}
        onChange={(e) => {
          const value = e.target.value;
          setFamily(value);
          const next = value.trim();
          if (next === saved || (next !== "" && monoFontError(next) !== null)) return;
          save(withAppearance(settings, "terminal_font_family", next === "" ? null : next));
        }}
        onBlur={commitFamily}
        onKeyDown={(e) => e.key === "Enter" && commitFamily()}
      />
      <p className={error ? "error small" : "settings-row-detail"}>{error ?? "Enter font name exactly as installed, e.g. Arial, Papyrus, FiraCode Nerd Font"}</p>
      <div className="settings-terminal-size">
        <div className="settings-terminal-size-head">
          <span className="settings-row-label">Terminal Font Size</span>
          <span className="settings-row-help">{size}px</span>
        </div>
        <Slider.Root
          className="settings-terminal-slider"
          min={TERMINAL_FONT_SIZE_MIN}
          max={TERMINAL_FONT_SIZE_MAX}
          step={1}
          largeStep={10}
          value={size}
          onValueChange={(value) => save(withAppearance(settings, "terminal_font_size", value))}
        >
          <Slider.Control className="settings-terminal-slider-control">
            <Slider.Track className="settings-terminal-slider-track">
              <Slider.Indicator className="settings-terminal-slider-fill" />
            </Slider.Track>
            <Slider.Thumb className="settings-terminal-slider-thumb" aria-label="Terminal Font Size" />
          </Slider.Control>
        </Slider.Root>
      </div>
      <div
        className="settings-terminal-preview"
        aria-label="Terminal font preview"
        style={{ fontFamily: terminalFontFamily(error === null ? family : saved), fontSize: `${size}px`, lineHeight: TERMINAL_LINE_HEIGHT }}
      >
        <div> ~/project main ±3 ?2</div>
        <div>❯ npm test ✓</div>
        <div>└── ▶ All tests passed!</div>
      </div>
    </div>
  );
}
