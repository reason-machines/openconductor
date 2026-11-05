// How custom instructions from `[prompts]` reach the agent, as Conductor sends
// them (evidence/settings/NOTES.md, "Prompts"):
// - an action prompt (Review, Create PR, ...) gets the instructions appended
//   after its own text, marked as taking precedence (`_g` in its bundle);
// - the first message of a new chat gets `prompts.general` appended in a
//   `<user-preferences>` block (`lU6` in its runtime).
// Blank instructions add nothing. Wording of the precedence line is ours.

/** `action` followed by the user's instructions for it, when there are any. */
export function withUserPreferences(action: string, preferences: string | null | undefined): string {
  if (!preferences?.trim()) return action;
  return (
    `${action}\n\nIMPORTANT: the user's preferences below take precedence over the instructions above. ` +
    `Where they conflict, follow the preferences.\n\n## User preferences\n\n<user-preferences>\n${preferences.trim()}\n</user-preferences>`
  );
}

/** The first message of a new chat, with the repository's general instructions. */
export function withGeneralPreferences(message: string, general: string | null | undefined): string {
  if (!general?.trim()) return message;
  return `${message}\n<user-preferences>\n${general}\n</user-preferences>`;
}
