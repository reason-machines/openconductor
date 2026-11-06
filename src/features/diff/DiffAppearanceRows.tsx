// parity:diff.appearance:ui
// Settings › Appearance rows for diffs and code: Accessible colors and Code
// theme (with a highlighted preview) above Mono Font, and Code ligatures
// below it, in the order Conductor's Appearance page shows them
// (evidence/screens/settings--appearance--dark.png; REA read of renderApp
// 0.87.6 for the setting keys and values, and for the titles, descriptions
// and select widths of `rla`, `ala` and `fla`).
import { File as PierreFile } from "@pierre/diffs/react";
import { Row } from "../../settings/GeneralPage";
import { withAppearance } from "../../settings/appearance";
import type { Settings } from "../../settings/types";
import { COLOR_VISIONS, colorVisionFrom } from "./appearance.ts";
import { CODE_THEME_IDS, CODE_THEMES, codeThemeFrom, diffThemeFor, type CodeTheme } from "./codeThemes.ts";
import { registerCodeThemes } from "./useDiffTheme.ts";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

const PREVIEW = `// Load a workspace by id
export async function loadWorkspace(id: string): Promise<Workspace | null> {
  const rows = await db.select("SELECT * FROM workspaces WHERE id = ?", [id]);
  return rows.length > 0 ? { ...rows[0], pinned: true } : null;
}
`;

function themeType(): "light" | "dark" | "system" {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

/** Accessible colors and Code theme, shown above Mono Font. */
export function DiffColorRows({ settings, save }: Props) {
  const a = settings.appearance;
  const theme = codeThemeFrom(a.code_theme);
  registerCodeThemes();
  return (
    <>
      <Row label="Accessible colors" help="Theme optimized for color vision differences.">
        <select className="settings-select" style={{ width: 260 }} aria-label="Accessible colors" value={colorVisionFrom(a.color_vision)} onChange={(e) => save(withAppearance(settings, "color_vision", colorVisionFrom(e.target.value)))}>
          {COLOR_VISIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Code theme" help="Syntax highlighting colors for code blocks and editors.">
        <select className="settings-select" style={{ width: 220 }} aria-label="Code theme" value={theme} onChange={(e) => save(withAppearance(settings, "code_theme", codeThemeFrom(e.target.value) as CodeTheme))}>
          <option value="default">Default</option>
          {CODE_THEME_IDS.map((id) => (
            <option key={id} value={id}>
              {CODE_THEMES[id].label}
            </option>
          ))}
        </select>
      </Row>
      <div className="settings-code-preview" data-code-theme={theme}>
        <PierreFile file={{ name: "preview.ts", contents: PREVIEW }} options={{ disableFileHeader: true, disableLineNumbers: true, overflow: "scroll", theme: diffThemeFor(theme), themeType: themeType() }} />
      </div>
    </>
  );
}

/** Code ligatures, shown below Mono Font. */
export function DiffLigaturesRow({ settings, save }: Props) {
  return (
    <Row label="Code ligatures" help="Use font ligatures in file editors and diffs.">
      <input
        type="checkbox"
        role="switch"
        aria-label="Code ligatures"
        checked={settings.appearance.file_ligatures_enabled !== false}
        onChange={(e) => save(withAppearance(settings, "file_ligatures_enabled", e.target.checked))}
      />
    </Row>
  );
}
