import { useEffect, useState } from "react";
import { BUILTIN_MONO, MONO_FONTS, monoFontError, monoFontStack, withAppearance, zoomPercent, ZOOM_PERCENTS } from "./appearance";
import { Row } from "./GeneralPage";
import { TerminalFontRows } from "./TerminalFont";
import { withField } from "./model";
import type { Settings, Theme } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const BUILTIN = "builtin";
const CUSTOM = "custom";

/**
 * Settings › Appearance: Conductor's Theme, Low-contrast dark mode, App zoom
 * Mono Font and Terminal font rows, with its titles and descriptions
 * (evidence/settings/settings-registry.json). Its other Appearance rows
 * (code theme, accessible colors, ligatures, ...) are not built yet.
 */
export function AppearancePage({ settings, save }: Props) {
  const a = settings.appearance;
  const saved = a.mono_font ?? null;
  // "Custom..." stays local, input shown and nothing saved, until a valid name is typed.
  const [fontChoice, setFontChoice] = useState(saved === null ? BUILTIN : MONO_FONTS.includes(saved) ? saved : CUSTOM);
  const [custom, setCustom] = useState(saved !== null && !MONO_FONTS.includes(saved) ? saved : "");
  useEffect(() => {
    setFontChoice(saved === null ? BUILTIN : MONO_FONTS.includes(saved) ? saved : CUSTOM);
    if (saved !== null && !MONO_FONTS.includes(saved)) setCustom(saved);
  }, [saved]);
  const customError = fontChoice === CUSTOM ? monoFontError(custom) : null;

  const chooseFont = (choice: string) => {
    setFontChoice(choice);
    if (choice === BUILTIN) save(withAppearance(settings, "mono_font", null));
    else if (choice !== CUSTOM) save(withAppearance(settings, "mono_font", choice));
    else if (monoFontError(custom) === null) save(withAppearance(settings, "mono_font", custom.trim()));
  };
  const commitCustom = () => {
    if (monoFontError(custom) !== null || custom.trim() === saved) return;
    save(withAppearance(settings, "mono_font", custom.trim()));
  };
  const previewFont = fontChoice === BUILTIN ? BUILTIN_MONO : monoFontStack(fontChoice === CUSTOM ? custom : fontChoice);

  return (
    <div className="settings-rows">
      <Row label="Theme" help="Switch between light, dark, and system appearance.">
        <select
          aria-label="Theme"
          value={settings.general.theme}
          onChange={(e) => save(withField(settings, "general", "theme", e.target.value as Theme))}
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Low-contrast dark mode" help="Soften the app's colors when using the dark theme.">
        <input
          type="checkbox"
          role="switch"
          aria-label="Low-contrast dark mode"
          checked={a.low_contrast_dark_mode}
          onChange={(e) => save(withAppearance(settings, "low_contrast_dark_mode", e.target.checked))}
        />
      </Row>
      <Row label="App zoom" help="Adjust the size of the OpenConductor interface.">
        <select
          aria-label="App zoom"
          value={String(zoomPercent(a.zoom_level_v2))}
          onChange={(e) => save(withAppearance(settings, "zoom_level_v2", Number(e.target.value) / 100))}
        >
          {ZOOM_PERCENTS.map((p) => (
            <option key={p} value={String(p)}>
              {p}%
            </option>
          ))}
        </select>
      </Row>
      <Row label="Mono Font" help="Font used for code and diffs.">
        <select aria-label="Mono Font" value={fontChoice} onChange={(e) => chooseFont(e.target.value)}>
          <option value={BUILTIN}>System default</option>
          {MONO_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value={CUSTOM}>Custom...</option>
        </select>
      </Row>
      {fontChoice === CUSTOM && (
        <div className="settings-radio-detail">
          <input
            type="text"
            aria-label="Custom mono font"
            aria-invalid={customError !== null}
            placeholder="Enter font name..."
            spellCheck={false}
            autoComplete="off"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => e.key === "Enter" && commitCustom()}
          />
          <p className={customError && custom !== "" ? "error small" : "muted small"}>
            {customError && custom !== "" ? customError : "Enter font name exactly as installed on your system"}
          </p>
        </div>
      )}
      <div className="settings-font-preview" style={{ fontFamily: previewFont }}>
        <div className="muted">{"// Preview"}</div>
        <div>const greeting = 'Hello, World!';</div>
        <div>function sum(a, b) {"{ return a + b; }"}</div>
      </div>
      <TerminalFontRows settings={settings} save={save} />
    </div>
  );
}
