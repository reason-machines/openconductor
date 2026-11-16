// parity:chat.composer.pasteFilePaths
// Reads the clipboard's current plain text for the ⌘⇧V ("Paste copied files as
// paths") keybinding in the chat composer.
//
// Evidence: evidence/keybindings/keybindings.json confirms `chat.composer.pasteFilePaths`
// exists in Conductor 0.87.6 (key logical("v",["meta","shift"]), title "Paste copied
// files as paths", category Chat, configurable:true).
// evidence/packaging/conductor-plugin-commands.json shows Conductor's frontend invokes
// only ["read_text","write_html","write_text"] on the clipboard-manager plugin, so the
// handler reads clipboard text via plugin:clipboard-manager|read_text, not a custom
// native command.
//
// Platform adapter: Composer.tsx imports readClipboardTextFromPlatform so it
// does not need to import @tauri-apps/api/core directly. The injected-reader
// overload (readClipboardText) stays for unit tests.

export interface ReadClipboard {
  readText(): Promise<string>;
}

/**
 * Returns the clipboard's current plain-text content, or null when the clipboard
 * is empty, unreadable, or the read is refused.
 *
 * @param clipboard  Injectable clipboard reader; use readClipboardTextFromPlatform
 *                   for the runtime adapter.
 */
export async function readClipboardText(clipboard: ReadClipboard): Promise<string | null> {
  let text: string;
  try {
    text = await clipboard.readText();
  } catch {
    return null;
  }
  return text || null;
}

/**
 * Runtime platform adapter: reads clipboard text via the Tauri
 * clipboard-manager plugin in desktop builds, or navigator.clipboard in
 * browser. Composer.tsx imports this so it does not need a direct
 * @tauri-apps/api/core import.
 */
export async function readClipboardTextFromPlatform(): Promise<string | null> {
  const { invoke, isTauri } = await import("@tauri-apps/api/core");
  const clip: ReadClipboard = isTauri()
    ? { readText: () => invoke<string>("plugin:clipboard-manager|read_text") }
    : (navigator.clipboard as unknown as ReadClipboard);
  return readClipboardText(clip);
}
