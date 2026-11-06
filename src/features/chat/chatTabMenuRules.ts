// Rules of a chat tab's right-click menu (Conductor 0.87.6 `u8i`, its tab bar `lco`;
// renderApp-D_fmY7hW.js @7,417,968 and @7,448,143, REA-extracted, read as data). Pure.

/**
 * `lco`'s `showClose`: the Close tab / Close others section shows in a writable
 * workspace when it has several chats or this chat has a user message.
 */
export function showCloseSection(o: { writable: boolean; chatCount: number; hasUserMessage: boolean }): boolean {
  return o.writable && (o.chatCount > 1 || o.hasUserMessage);
}

/**
 * Splits a shortcut hint whose key is Enter ("⌘⌥↵") into its modifiers and a flag,
 * so the menu can draw Conductor's corner-down-left glyph (`gf`) in place of "↵".
 */
export function splitEnterHint(text: string): { prefix: string; enter: boolean } {
  return text.endsWith("↵") ? { prefix: text.slice(0, -1), enter: true } : { prefix: text, enter: false };
}
