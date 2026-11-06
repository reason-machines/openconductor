import { useEffect, useState } from "react";
import { BUILTIN_MONO, MONO_FONTS, monoFontError, monoFontStack, withAppearance, zoomPercent, ZOOM_PERCENTS } from "./appearance";
import { Row } from "./GeneralPage";
import { TerminalFontRows } from "./TerminalFont";
import { DiffColorRows, DiffLigaturesRow } from "../features/diff/DiffAppearanceRows";
import { withField } from "./model";
import { Keys, Select, Toggle } from "./controls";
import { enumPref, withEnumPref } from "./prefs";
import { Markdown } from "../features/chat/markdown";
import { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import type { Settings, Theme } from "./types";
import { PALETTE_IDS, PALETTE_LABELS, paletteFrom, type PaletteId } from "../theme/palettes.ts";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Conductor's `Yaa`, the Markdown Style preview. */
const MARKDOWN_PREVIEW = "# Add New Button\n\nBelieve it or not, this plan will add a new button to the interface.";

const shortcutGlyphs = (commandId: string, overrides: Overrides) => effectiveShortcuts(commandId, overrides).map(glyphs)[0] ?? "";

const BUILTIN = "builtin";
const CUSTOM = "custom";

/**
 * Settings › Personal › Appearance, row for row with Conductor 0.87.6's
 * appearance panel (`vla` in renderApp-D_fmY7hW.js): Theme, Color palette
 * (ours; Neutral, Stone, Blue, Slate, Zinc), Low-contrast dark mode, App zoom, Colored sidebar diffs, Accessible colors, Code theme (with
 * preview), Mono Font (with preview), Code ligatures, Markdown Style (with
 * preview), Terminal font. Accessible colors, Code theme and Code ligatures
 * come from the diff feature (DiffAppearanceRows.tsx).
 */
export function AppearancePage({ settings, save }: Props) {
  const a = settings.appearance;
  const { overrides } = useKeybindingOverrides();
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
      <Row label="Theme" help={<>Toggle with <Keys glyphs={shortcutGlyphs("toggleTheme", overrides)} /></>}>
        <Select<Theme>
          label="Theme"
          value={settings.general.theme}
          options={THEMES}
          onChange={(v) => save(withField(settings, "general", "theme", v))}
        />
      </Row>
      <Row label="Color palette" help="Surfaces, text and the accent color. Status and diff colors keep their meaning.">
        <Select<PaletteId>
          label="Color palette"
          value={paletteFrom(a.color_palette)}
          options={PALETTE_IDS.map((id) => ({ value: id, label: PALETTE_LABELS[id] }))}
          onChange={(v) => save(withAppearance(settings, "color_palette", v))}
        />
      </Row>
      <Row label="Low-contrast dark mode">
        <Toggle label="Low-contrast dark mode" checked={a.low_contrast_dark_mode} onChange={(on) => save(withAppearance(settings, "low_contrast_dark_mode", on))} />
      </Row>
      <Row
        label="App zoom"
        help={
          <>
            Adjust with <Keys glyphs={shortcutGlyphs("view.zoomOut", overrides)} /> (zoom out) or <Keys glyphs={shortcutGlyphs("view.zoomIn", overrides)} /> (zoom in)
          </>
        }
      >
        <Select
          label="App zoom"
          value={String(zoomPercent(a.zoom_level_v2))}
          options={ZOOM_PERCENTS.map((p) => ({ value: String(p), label: `${p}%` }))}
          onChange={(v) => save(withAppearance(settings, "zoom_level_v2", Number(v) / 100))}
        />
      </Row>
      <Row label="Colored sidebar diffs" help="Always show line change colors in the sidebar, even for unselected workspaces.">
        <Toggle label="Colored sidebar diffs" checked={a.colored_sidebar_diffs === true} onChange={(on) => save(withAppearance(settings, "colored_sidebar_diffs", on))} />
      </Row>
      <DiffColorRows settings={settings} save={save} />
      <Row label="Mono Font" help="Font used for code and diffs">
        <select className="settings-select" style={{ width: 180 }} aria-label="Mono Font" value={fontChoice} onChange={(e) => chooseFont(e.target.value)}>
          <option value={BUILTIN}>System default</option>
          {MONO_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value={CUSTOM}>Custom...</option>
        </select>
      </Row>
      <div className="settings-row-attached">
        {fontChoice === CUSTOM && (
          <div className="settings-custom-font">
            <input
              type="text"
              className="settings-field"
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
            <p className={customError && custom !== "" ? "error small" : "settings-row-detail"}>
              {customError && custom !== "" ? customError : "Enter font name exactly as installed on your system"}
            </p>
          </div>
        )}
        <div className="settings-preview" style={{ fontFamily: previewFont }}>
          <div className="settings-row-help">{"// Preview"}</div>
          <div>const greeting = 'Hello, World!';</div>
          <div>function sum(a, b) {"{ return a + b; }"}</div>
        </div>
      </div>
      <DiffLigaturesRow settings={settings} save={save} />
      <Row label="Markdown Style" help="Rendering style for markdown files">
        <Select
          label="Markdown Style"
          width={180}
          value={enumPref(settings, "markdown_style")}
          options={[
            { value: "default", label: "Default" },
            { value: "tufte", label: "Tufte" },
          ]}
          onChange={(v) => save(withEnumPref(settings, "markdown_style", v))}
        />
      </Row>
      <div className="settings-row-attached">
        <div className={`settings-markdown-preview ${enumPref(settings, "markdown_style") === "tufte" ? "tufte" : ""}`}>
          <Markdown text={MARKDOWN_PREVIEW} />
        </div>
      </div>
      <TerminalFontRows settings={settings} save={save} />
    </div>
  );
}
