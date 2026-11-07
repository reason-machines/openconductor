export type ComposerPart =
  | { kind: "text"; text: string }
  | { kind: "file"; path: string; label: string; directory: boolean };

const PREFIX = "\u001eOpenConductorComposer:1\n";
export const COMPOSER_CLIPBOARD = "application/x-openconductor-composer+json";

export function parseComposerParts(value: unknown): ComposerPart[] | null {
  if (!Array.isArray(value)) return null;
  const parts: ComposerPart[] = [];
  for (const part of value) {
    if (!part || typeof part !== "object") return null;
    if (part.kind === "text" && typeof part.text === "string") parts.push({ kind: "text", text: part.text });
    else if (part.kind === "file" && typeof part.path === "string" && part.path !== "" && !part.path.includes("\0") && typeof part.label === "string" && typeof part.directory === "boolean") {
      parts.push({ kind: "file", path: part.path, label: part.label, directory: part.directory });
    } else return null;
  }
  return parts;
}

export function readComposerDraft(draft: string): ComposerPart[] {
  if (draft.startsWith(PREFIX)) {
    try {
      const parts = parseComposerParts(JSON.parse(draft.slice(PREFIX.length)));
      if (parts) return parts;
    } catch { /* A malformed stored envelope remains literal text. */ }
  }
  return [{ kind: "text", text: draft }];
}

export function writeComposerDraft(parts: readonly ComposerPart[]): string {
  const text = parts.map((part) => part.kind === "text" ? part.text : "").join("");
  return parts.some((part) => part.kind === "file") || text.startsWith(PREFIX)
    ? PREFIX + JSON.stringify(parts)
    : text;
}

export function composerPrompt(draft: string): string {
  return readComposerDraft(draft).map((part) => {
    if (part.kind === "text") return part.text;
    return /\s/.test(part.path) ? `@${JSON.stringify(part.path)}` : `@${part.path}`;
  }).join("");
}

export function appendComposerText(draft: string, text: string): string {
  if (!composerPrompt(draft).trim()) return writeComposerDraft([{ kind: "text", text }]);
  const parts = readComposerDraft(draft);
  while (parts.at(-1)?.kind === "text") {
    const last = parts.pop();
    if (last?.kind !== "text") break;
    if (last.text.trimEnd()) { parts.push({ kind: "text", text: last.text.trimEnd() }); break; }
  }
  return writeComposerDraft([...parts, { kind: "text", text: `\n\n${text}` }]);
}

export function clipboardComposerParts(text: string): ComposerPart[] | null {
  try { return parseComposerParts(JSON.parse(text)); } catch { return null; }
}
