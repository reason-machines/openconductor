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
// Pure module: inject a ReadClipboard for tests; Composer.tsx supplies the platform
// implementation (Tauri invoke in desktop, navigator.clipboard in browser).

export interface ReadClipboard {
  readText(): Promise<string>;
}

/**
 * Returns the clipboard's current plain-text content, or null when the clipboard
 * is empty, unreadable, or the read is refused.
 *
 * @param clipboard  Injectable clipboard reader; Composer.tsx supplies the
 *                   Tauri or web implementation at the call site.
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
