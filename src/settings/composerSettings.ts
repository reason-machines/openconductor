// "Send messages with": what choosing a send key on Settings > General writes
// (Conductor's `RQt` in index-BGEQ8YjU.js, read on Sven's Mac;
// evidence/settings/NOTES.md "Composer send settings"). Pure, so node --test
// covers it. "Follow-up behavior" is the `default_message_send_mode` table
// pref (src/settings/prefs.ts); the chat view reads it with useFollowUpMode.
import { sendKeyPresetUpdates, type OverrideUpdate } from "../keybindings/overrides.ts";
import type { SendKeyMode } from "../keybindings/registry.ts";

/**
 * Write the preset to the four send commands, then the legacy
 * `message_send_key`. Resolves false when the override write was refused;
 * the legacy key is then left alone.
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
