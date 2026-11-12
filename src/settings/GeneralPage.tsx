import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfigSyncDialog } from "./ConfigSyncDialog";
import { checkFullDiskAccess, openUrl } from "../backend";
import { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";
import { currentSendKeyMode, effectiveShortcuts, type Overrides } from "../keybindings/overrides";
import type { SendKeyMode } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";
import { ButtonRow, Keys, PrefSwitchRow, Select, Toggle } from "./controls";
import { SyncIcon, VolumeIcon } from "./icons";
import { SETTINGS_CHANGED } from "./appearance";
import { setAppPref } from "./appPrefs";
import { chooseSendKey } from "./composerSettings";
import { withField } from "./model";
import { notificationPermissionGranted } from "./notificationPermission";
import { enumPref, withEnumPref } from "./prefs";
import { GeneralAppPrefRows } from "./rows/AppPrefRows";
import { playCompletionSound, SOUND_OPTIONS } from "./sound";
import type { Settings, SoundType } from "./types";
import { useSettingsOverrideStore } from "./useSettingsOverrideStore";

interface Props {
  settings: Settings;
  save: (next: Settings) => void | Promise<boolean>;
  notify?: (kind: "error" | "info", message: string) => void;
}

/** Conductor's `aga`: System Settings › Privacy & Security › Full Disk Access. */
const FULL_DISK_ACCESS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

const shortcutGlyphs = (commandId: string, overrides: Overrides) => effectiveShortcuts(commandId, overrides).map(glyphs)[0] ?? "";

/**
 * Settings › Personal › General, row for row with Conductor 0.87.6's `general`
 * tab (renderApp-D_fmY7hW.js registry `gga`, evidence/settings/NOTES.md
 * "Settings pages, row for row"). "Workspace API access" is hidden in personal
 * organizations (`hideInPersonalOrganizations`), which is every OpenConductor
 * user, so it is not listed.
 */
export function GeneralPage({ settings, save, notify }: Props) {
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const g = settings.general;
  const [syncOpen, setSyncOpen] = useState(false);
  const fullDiskAccess = useFullDiskAccessStatus();
  const { overrides } = useKeybindingOverrides();
  const followUp = enumPref(settings, "default_message_send_mode");
  return (
    <div className="settings-rows">
      <SendKeyRow settings={settings} save={save} />
      <Row
        label="Follow-up behavior"
        help="Queue messages to send after the agent finishes, or steer the agent mid-turn."
        detail={
          <>
            Use <Keys glyphs={shortcutGlyphs("chat.submitOppositeFollowUp", overrides)} /> to {followUp === "steering" ? "queue" : "steer"}
          </>
        }
      >
        <Select
          label="Follow-up behavior"
          value={followUp}
          options={[
            { value: "queued", label: "Queue" },
            { value: "steering", label: "Steer" },
          ]}
          onChange={(v) =>
            // Open chats re-read Follow-up behavior on SETTINGS_CHANGED (useFollowUpMode).
            void Promise.resolve(save(withEnumPref(settings, "default_message_send_mode", v))).then((ok) => {
              if (ok !== false) window.dispatchEvent(new Event(SETTINGS_CHANGED));
            })
          }
        />
      </Row>
      <Row label="Agent notifications" help="Get notified when an agent finishes working.">
        <Toggle
          label="Agent notifications"
          checked={g.send_native_notification}
          onChange={async (on) => {
            if (on && !await notificationPermissionGranted()) {
              notify?.("error", "Notification permission not granted");
              return;
            }
            await save(withField(latestSettings.current, "general", "send_native_notification", on));
          }}
        />
      </Row>
      <PrefSwitchRow settings={settings} save={save} pref="mention_notifications_enabled" label="@ notifications" help="Get notified when a teammate mentions you." />
      <Row label="Completion sound" help="Choose what plays when AI finishes working in a chat.">
        <span className="settings-inline">
          <Select<SoundType>
            label="Completion sound"
            width={190}
            value={g.sound_type}
            options={SOUND_OPTIONS}
            onChange={(v) => save(withField(settings, "general", "sound_type", v))}
          />
          <button type="button" className="btn btn-ghost settings-test" disabled={g.sound_type === "none"} onClick={() => playCompletionSound(g.sound_type)}>
            <VolumeIcon />
            Test
          </button>
        </span>
      </Row>
      <Row label="Full disk access permissions" help="To let agents work without repeated folder permission prompts.">
        <span className="settings-inline" style={{ gap: 12 }}>
          {fullDiskAccess === true && <span style={{ color: "var(--s-muted)", fontSize: 14 }}>Granted</span>}
          <button type="button" className="btn settings-outline" onClick={() => void openUrl(FULL_DISK_ACCESS_URL).catch(() => notify?.("error", "Couldn't open System Settings. Go to Privacy & Security > Full Disk Access to grant it manually."))}>
            Open System Settings
          </button>
        </span>
      </Row>
      <PrefSwitchRow settings={settings} save={save} pref="auto_convert_long_text" label="Auto-convert long text" help="Convert pasted text over 5000 characters into text attachments" />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="not_absolutely_right"
        label="I'm not absolutely right, thank you very much"
        help={`Strip "You're absolutely right!" from AI messages`}
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="always_show_context_wheel"
        label="Always show context usage"
        help="Always show context usage. By default, it is only shown when more than 70% is used."
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="caffeinate_while_agents_running"
        label="Caffeinate while agents are running"
        help="Prevent your Mac from sleeping while an agent is actively working. Shuts off below 10% battery."
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="auto_restart_on_update_when_idle"
        label="Restart automatically on update"
        help={`Auto-triggers "Restart when idle" for downloaded OpenConductor updates.`}
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="mcp_status_indicator_enabled"
        label="Show MCP status in chat"
        help="Show a per-session MCP server status indicator in the composer."
      />
      <GeneralAppPrefRows overrides={overrides} />
      <ButtonRow
        label="Sync agent configs"
        help="Copy skills, slash commands, and MCP servers between Claude Code and Codex."
        button="Sync"
        icon={<SyncIcon />}
        onClick={() => setSyncOpen(true)}
      />
      {syncOpen && <ConfigSyncDialog onClose={() => setSyncOpen(false)} notify={notify} />}
    </div>
  );
}

/** Renderer status only: the native check and its error fallback are fail-open. */
function useFullDiskAccessStatus(): boolean | undefined {
  const [granted, setGranted] = useState<boolean>();
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    let active = true;
    let revision = 0;
    let timer: number | undefined;
    const refresh = async () => {
      const current = ++revision;
      window.clearTimeout(timer);
      let next: boolean;
      try {
        next = await checkFullDiskAccess();
      } catch (error) {
        console.error("check_full_disk_access failed:", error);
        next = true;
      }
      if (!active || current !== revision) return;
      setGranted(next);
      if (next === false) timer = window.setTimeout(() => void refresh(), 5000);
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return granted;
}

/**
 * "Send messages with": Conductor's `xAn({messageSendKey})` rewrites the four
 * send commands' keybinding overrides to a preset and then stores the legacy
 * `message_send_key`; a custom mix shows the "Custom" placeholder.
 */
function SendKeyRow({ settings, save }: Props) {
  const { overrides } = useKeybindingOverrides();
  const store = useSettingsOverrideStore(settings, save);
  const mode = currentSendKeyMode(overrides);
  // The preset goes to the four send commands, then the legacy `message_send_key` (Conductor's `RQt`).
  const choose = (next: SendKeyMode) =>
    void chooseSendKey(next, store.updateMany, (m) => setAppPref({ key: "message_send_key", value: m })).catch((err) =>
      console.warn("Failed to update message send key", err),
    );
  return (
    <Row
      label="Send messages with"
      help="Choose which key combination sends messages"
      detail={
        <>
          Use <Keys glyphs={shortcutGlyphs("chat.newLine", overrides)} /> for new lines
        </>
      }
    >
      <select className="settings-select" aria-label="Send messages with" style={{ width: 140 }} value={mode ?? ""} onChange={(e) => choose(e.target.value as SendKeyMode)}>
        {mode === undefined && (
          <option value="" disabled>
            Custom
          </option>
        )}
        <option value="enter">Enter</option>
        <option value="cmd-enter">⌘ Enter</option>
      </select>
    </Row>
  );
}

/**
 * One settings row, Conductor's `Al`: title and description on the left, the
 * control (`children`) on the right. `detail` adds a small third line and
 * aligns the control to the top; `stacked` puts the children under the text
 * instead, full width; `control` keeps a control on the right and puts the
 * children below.
 */
export function Row({
  label,
  help,
  detail,
  stacked,
  control,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  detail?: ReactNode;
  stacked?: boolean;
  /** A control on the right while `children` go below (Conductor passes both `control` and `children`). */
  control?: ReactNode;
  children?: ReactNode;
}) {
  const below = stacked || control !== undefined;
  const right = control ?? (stacked ? undefined : children);
  return (
    <div className={`settings-row${detail ? " settings-row-top" : ""}${stacked ? " settings-row-stacked" : ""}`} data-settings-row>
      <div className="settings-row-main">
        <div className="settings-row-text">
          <div className="settings-row-label">{label}</div>
          {help && <div className="settings-row-help">{help}</div>}
          {detail && <div className="settings-row-detail">{detail}</div>}
        </div>
        {right !== undefined && <div className="settings-row-control">{right}</div>}
      </div>
      {below && children !== undefined && children !== false && <div className="settings-row-body">{children}</div>}
    </div>
  );
}
