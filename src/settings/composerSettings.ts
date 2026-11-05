// "Send messages with" and "Follow-up behavior": Conductor's two composer
// rows on Settings > General (renderApp-D_fmY7hW.js settings registry, read
// on Sven's Mac; evidence/settings/NOTES.md "Composer send settings").
// Pure, so node --test covers what each choice does.
import type { FollowUpMode } from "../features/chat/queue.ts";
import { effectiveShortcuts, sendKeyPresetUpdates, type OverrideUpdate, type Overrides } from "../keybindings/overrides.ts";
import type { SendKeyMode } from "../keybindings/registry.ts";
import { glyphs } from "../keybindings/shortcut.ts";

export const SEND_KEY_TITLE = "Send messages with";
export const SEND_KEY_DESCRIPTION = "Choose which key combination sends messages";
/** Shown when the send commands match neither preset. */
export const SEND_KEY_CUSTOM = "Custom";
export const SEND_KEY_OPTIONS: readonly { value: SendKeyMode; label: string }[] = [
  { value: "enter", label: "Enter" },
  { value: "cmd-enter", label: "⌘ Enter" },
];

export const FOLLOW_UP_TITLE = "Follow-up behavior";
export const FOLLOW_UP_DESCRIPTION = "Queue messages to send after the agent finishes, or steer the agent mid-turn.";
export const FOLLOW_UP_OPTIONS: readonly { value: FollowUpMode; label: string }[] = [
  { value: "queued", label: "Queue" },
  { value: "steering", label: "Steer" },
];

const firstGlyph = (commandId: string, overrides: Overrides) => {
  const s = effectiveShortcuts(commandId, overrides)[0];
  return s ? glyphs(s) : "";
};

/** "Use ⇧↵ for new lines", with the live new-line key. */
export const sendKeyDetail = (overrides: Overrides): string => `Use ${firstGlyph("chat.newLine", overrides)} for new lines`;

/** "Use ⌘↵ to queue" under steering, "... to steer" under queueing, with the live opposite key. */
export const followUpDetail = (mode: FollowUpMode, overrides: Overrides): string =>
  `Use ${firstGlyph("chat.submitOppositeFollowUp", overrides)} to ${mode === "steering" ? "queue" : "steer"}`;

/** A select value from the UI, narrowed; anything unknown is not a choice. */
export const asSendKeyMode = (v: string): SendKeyMode | undefined => SEND_KEY_OPTIONS.find((o) => o.value === v)?.value;
export const asFollowUpMode = (v: string): FollowUpMode | undefined => FOLLOW_UP_OPTIONS.find((o) => o.value === v)?.value;

/**
 * Choosing a send key: write the preset to the four send commands, then the
 * legacy `message_send_key` (Conductor's `RQt`). Resolves false when the
 * override write was refused; the legacy key is then left alone.
 */
export async function chooseSendKey(
  mode: SendKeyMode,
  writeOverrides: (updates: readonly OverrideUpdate[]) => Promise<boolean>,
  writeLegacy: (mode: SendKeyMode) => Promise<unknown>,
): Promise<boolean> {
  if (!(await writeOverrides(sendKeyPresetUpdates(mode)))) return false;
  await writeLegacy(mode);
  return true;
}
