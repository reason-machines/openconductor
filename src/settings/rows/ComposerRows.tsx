// Settings > General: "Send messages with" and "Follow-up behavior", Conductor's
// composer rows (src/settings/composerSettings.ts has their rules). The send key
// writes the keybinding overrides the composer reads; the follow-up mode is an
// app preference the chat view passes to the composer. Both apply at once.
import { Row } from "../GeneralPage";
import { setAppPref, useAppPrefs } from "../appPrefs";
import {
  asFollowUpMode,
  asSendKeyMode,
  chooseSendKey,
  FOLLOW_UP_DESCRIPTION,
  FOLLOW_UP_OPTIONS,
  FOLLOW_UP_TITLE,
  followUpDetail,
  SEND_KEY_CUSTOM,
  SEND_KEY_DESCRIPTION,
  SEND_KEY_OPTIONS,
  SEND_KEY_TITLE,
  sendKeyDetail,
} from "../composerSettings";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider";
import { currentSendKeyMode } from "../../keybindings/overrides";
import type { SendKeyMode } from "../../keybindings/registry";
import type { Settings } from "../types";
import { useSettingsOverrideStore } from "../useSettingsOverrideStore";

interface Props {
  settings: Settings;
  save: (next: Settings) => Promise<boolean>;
}

export function ComposerRows({ settings, save }: Props) {
  const { overrides } = useKeybindingOverrides();
  const store = useSettingsOverrideStore(settings, save);
  const prefs = useAppPrefs();
  const sendKey = currentSendKeyMode(overrides);
  const followUp = prefs.default_message_send_mode;

  const pickSendKey = (mode: SendKeyMode) => {
    chooseSendKey(mode, store.updateMany, (m) => setAppPref({ key: "message_send_key", value: m })).then(
      (ok) => ok || console.warn("Failed to update message send key"),
      (err) => console.warn("Failed to update message send key", err),
    );
  };

  return (
    <>
      <Row label={SEND_KEY_TITLE} help={`${SEND_KEY_DESCRIPTION}. ${sendKeyDetail(overrides)}.`}>
        <select
          aria-label={SEND_KEY_TITLE}
          value={sendKey ?? ""}
          onChange={(e) => {
            const mode = asSendKeyMode(e.target.value);
            if (mode) pickSendKey(mode);
          }}
        >
          {sendKey === undefined ? (
            <option value="" disabled>
              {SEND_KEY_CUSTOM}
            </option>
          ) : null}
          {SEND_KEY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {sendKey !== "enter" ? (
          <button type="button" className="btn btn-small" onClick={() => pickSendKey("enter")}>
            Reset
          </button>
        ) : null}
      </Row>
      <Row label={FOLLOW_UP_TITLE} help={`${FOLLOW_UP_DESCRIPTION} ${followUpDetail(followUp, overrides)}.`}>
        <select
          aria-label={FOLLOW_UP_TITLE}
          value={followUp}
          onChange={(e) => {
            const mode = asFollowUpMode(e.target.value);
            if (mode) setAppPref({ key: "default_message_send_mode", value: mode }).catch((err) => console.warn("could not save default_message_send_mode", err));
          }}
        >
          {FOLLOW_UP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}
