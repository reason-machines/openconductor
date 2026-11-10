import { getSettings, updateSettings } from "../settings/api";
import type { ReasonAccount } from "../settings/agents/reasonModes";

/** A browser pairing explicitly selects its workspace; never replace an existing chat default. */
export async function rememberPairedWorkspace(account: ReasonAccount): Promise<void> {
  const settings = await getSettings();
  if (settings.reason.workspace) return;
  const selected = account.workspaces.find((workspace) => workspace.selected);
  if (!selected) throw new Error("Choose a workspace in Reason, then retry your message in this chat.");
  await updateSettings({ ...settings, reason: { ...settings.reason, workspace: selected.slug } });
}
