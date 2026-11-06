// Settings rows Conductor keeps in conductor.db's `settings` table (the
// backend's src-tauri/src/settings/table_prefs.rs). Each key rides in the
// Settings section the backend overlays it on; a key that has never been set
// is absent, and reads as Conductor's default from this table.
//
// Defaults: Conductor 0.87.6's registry (`Te(key, default)` in
// index-BGEQ8YjU.js) or, where it declares none, the row's own hook default
// in renderApp-D_fmY7hW.js (`{data: n = !0}`), see evidence/settings/NOTES.md
// "Settings pages, row for row".
import type { Settings } from "./types";

type Section = "top" | "general" | "git" | "advanced" | "experimental" | "appearance";

interface BoolPref {
  section: Section;
  default: boolean;
}
interface EnumPref<V extends string> {
  section: Section;
  default: V;
  values: readonly V[];
}

export const FOLLOW_UP_MODES = ["queued", "steering"] as const;
export const PR_OPEN_TARGETS = ["github", "linear", "graphite"] as const;
export const MARKDOWN_STYLES = ["default", "tufte"] as const;

const bool = (section: Section, d: boolean): BoolPref => ({ section, default: d });

export const BOOL_PREFS = {
  mention_notifications_enabled: bool("general", true),
  auto_convert_long_text: bool("general", true),
  not_absolutely_right: bool("general", false),
  always_show_context_wheel: bool("general", false),
  caffeinate_while_agents_running: bool("general", false),
  auto_restart_on_update_when_idle: bool("general", false),
  mcp_status_indicator_enabled: bool("general", false),
  auto_rename_workspace_on_branch_name_set: bool("git", true),
  github_stacked_prs_enabled: bool("git", true),
  automerge_enabled: bool("top", false),
  treat_optional_checks_as_blocking: bool("top", false),
  // Conductor's row reads an unset value as on (`{data: n = !0}` in `opa`).
  internal_remote_local_execution_mcp: bool("advanced", true),
  always_allow_local_execution: bool("advanced", false),
  auto_sync_files_in_new_cloud_workspaces: bool("advanced", true),
  experimental_auto_permission_mode: bool("experimental", false),
  experimental_configurable_center_panel: bool("experimental", false),
  experimental_fork_to_new_tab: bool("experimental", false),
  experimental_in_app_browser_preview: bool("experimental", false),
  experimental_legacy_file_preview_and_editing: bool("experimental", false),
  experimental_show_workspace_numbers: bool("experimental", false),
  internal_workspace_status_matrix: bool("experimental", false),
  experimental_cloud_ui: bool("experimental", false),
  experimental_cloud_desktop: bool("experimental", false),
  local_git_forge_enabled: bool("experimental", false),
  voice_mode: bool("experimental", false),
  experimental_sidebar_transparency: bool("experimental", false),
} as const satisfies Record<string, BoolPref>;

export const ENUM_PREFS = {
  default_message_send_mode: { section: "general", default: "steering", values: FOLLOW_UP_MODES } as EnumPref<(typeof FOLLOW_UP_MODES)[number]>,
  pull_request_open_target: { section: "git", default: "github", values: PR_OPEN_TARGETS } as EnumPref<(typeof PR_OPEN_TARGETS)[number]>,
  markdown_style: { section: "appearance", default: "default", values: MARKDOWN_STYLES } as EnumPref<(typeof MARKDOWN_STYLES)[number]>,
};

export type BoolPrefKey = keyof typeof BOOL_PREFS;
export type EnumPrefKey = keyof typeof ENUM_PREFS;
type EnumValue<K extends EnumPrefKey> = (typeof ENUM_PREFS)[K]["default"];

function container(s: Settings, section: Section): Record<string, unknown> | undefined {
  return section === "top" ? s : (s[section] as Record<string, unknown> | undefined);
}

function withValue(s: Settings, section: Section, key: string, value: unknown): Settings {
  if (section === "top") return { ...s, [key]: value };
  return { ...s, [section]: { ...(s[section] as object | undefined), [key]: value } };
}

/** The stored flag, or Conductor's default when it was never set (or holds a non-boolean). */
export function boolPref(s: Settings, key: BoolPrefKey): boolean {
  const v = container(s, BOOL_PREFS[key].section)?.[key];
  return typeof v === "boolean" ? v : BOOL_PREFS[key].default;
}

export function withBoolPref(s: Settings, key: BoolPrefKey, value: boolean): Settings {
  return withValue(s, BOOL_PREFS[key].section, key, value);
}

export function enumPref<K extends EnumPrefKey>(s: Settings, key: K): EnumValue<K> {
  const p = ENUM_PREFS[key] as EnumPref<string>;
  const v = container(s, p.section)?.[key];
  return (typeof v === "string" && p.values.includes(v) ? v : p.default) as EnumValue<K>;
}

export function withEnumPref<K extends EnumPrefKey>(s: Settings, key: K, value: EnumValue<K>): Settings {
  return withValue(s, ENUM_PREFS[key].section, key, value);
}
