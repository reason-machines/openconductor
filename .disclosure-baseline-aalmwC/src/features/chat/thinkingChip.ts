// The collapsed Thinking row's chip (Conductor's thinking tool row, renderApp
// offset 7803137, shows the text as a single truncated line). Its bold title
// is written as Markdown ("**Responding concisely** ..."), so the chip drops
// the `**` / `__` markers and keeps the words. The expanded body still renders
// the full Markdown.
export function thinkingChipText(text: string): string {
  return text.trim().replace(/(\*\*|__)(.+?)\1/g, "$2");
}
