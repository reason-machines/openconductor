import { composerPrompt, parseComposerParts, readComposerDraft, writeComposerDraft, type ComposerPart } from "./composerDocument.ts";
import { messageOrigin, plainText, type ChatMessage } from "./types.ts";

export type SentAttachment =
  | { kind: "workspace-file"; name: string; label: string; path: string }
  | { kind: "embedded"; name: string; label: string };

export interface SentUserContentV1 {
  version: 1;
  parts: readonly ComposerPart[];
  attachments: readonly SentAttachment[];
}

export interface UserPrompt {
  text: string;
  userContent?: SentUserContentV1;
}

function content(parts: readonly ComposerPart[], attachments: readonly SentAttachment[]): SentUserContentV1 | undefined {
  if (!parts.some((part) => part.kind === "file") && !attachments.some((attachment) => attachment.kind === "workspace-file")) return undefined;
  return { version: 1, parts: parts.map((part) => ({ ...part })), attachments: attachments.map((attachment) => ({ ...attachment })) };
}

export function snapshotUserPrompt(input: UserPrompt): UserPrompt {
  const userContent = input.userContent && content(input.userContent.parts, input.userContent.attachments);
  return { text: input.text, ...(userContent ? { userContent } : {}) };
}

export function submittedUserPrompt(draft: string): UserPrompt {
  const parts = readComposerDraft(draft);
  for (const part of parts) {
    if (part.kind !== "text") break;
    part.text = part.text.trimStart();
    if (part.text) break;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    if (part.kind !== "text") break;
    part.text = part.text.trimEnd();
    if (part.text) break;
  }
  const userContent = content(parts, []);
  return { text: composerPrompt(draft).trim(), ...(userContent ? { userContent } : {}) };
}

export function withSentAttachmentDisplay(
  input: UserPrompt,
  attachments: readonly { name: string; label?: string }[],
  copiedPaths: ReadonlySet<string>,
): UserPrompt {
  const display: SentAttachment[] = attachments.map(({ name, label = name }) =>
    copiedPaths.has(name) ? { kind: "workspace-file", name, label, path: name } : { kind: "embedded", name, label });
  const userContent = content(input.userContent?.parts ?? [{ kind: "text", text: input.text }], display);
  return { text: input.text, ...(userContent ? { userContent } : {}) };
}

export function editedUserPrompt(input: UserPrompt, previous: UserPrompt): UserPrompt {
  const userContent = content(input.userContent?.parts ?? [{ kind: "text", text: input.text }], previous.userContent?.attachments ?? []);
  return { text: input.text, ...(userContent ? { userContent } : {}) };
}

function safePath(path: string): boolean {
  return path !== "" && !path.includes("\0") && !path.includes("\\") && !path.startsWith("//")
    && !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.split("/").some((part) => part === "." || part === "..");
}

export function parseSentUserContent(value: unknown): SentUserContentV1 | undefined {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
    || !("parts" in value) || !("attachments" in value) || !Array.isArray(value.attachments)) return undefined;
  const parts = parseComposerParts(value.parts);
  if (!parts || parts.some((part) => part.kind === "file" && !safePath(part.path))) return undefined;
  const attachments: SentAttachment[] = [];
  for (const attachment of value.attachments) {
    if (!attachment || typeof attachment !== "object" || typeof attachment.name !== "string" || typeof attachment.label !== "string") return undefined;
    if (attachment.kind === "embedded") attachments.push({ kind: "embedded", name: attachment.name, label: attachment.label });
    else if (attachment.kind === "workspace-file" && typeof attachment.path === "string" && safePath(attachment.path)) {
      attachments.push({ kind: "workspace-file", name: attachment.name, label: attachment.label, path: attachment.path });
    } else return undefined;
  }
  return content(parts, attachments);
}

export function queuedUserDraft(input: UserPrompt): string {
  return input.userContent ? writeComposerDraft(input.userContent.parts) : writeComposerDraft([{ kind: "text", text: input.text }]);
}

export function retryUserPrompt(message: ChatMessage): UserPrompt {
  return snapshotUserPrompt({ text: plainText(message), ...(messageOrigin(message).kind === "user" && message.userContent ? { userContent: message.userContent } : {}) });
}

export function sentFileTarget(
  workspacePath: string | undefined,
  file: Extract<ComposerPart, { kind: "file" }> | Extract<SentAttachment, { kind: "workspace-file" }>,
): string | null {
  if (!workspacePath?.startsWith("/") || !safePath(workspacePath) || !safePath(file.path) || file.path.endsWith("/") || ("directory" in file && file.directory)) return null;
  const root = workspacePath.replace(/\/+$/, "") || "/";
  const prefix = root === "/" ? root : root + "/";
  const target = file.path.startsWith("/") ? file.path : prefix + file.path;
  return target.startsWith(prefix) && target.length > prefix.length ? target : null;
}
