import { clipboardComposerParts, COMPOSER_CLIPBOARD } from "./composerDocument.ts";

type PasteData = {
  getData: DataTransfer["getData"];
  items: ArrayLike<Pick<DataTransferItem, "kind" | "type">>;
};

function hasReferenceMetadata(html: string): boolean {
  if (!html) return false;
  const document = new DOMParser().parseFromString(html, "text/html");
  const encoded = document.querySelector("[data-conductor-clipboard]")?.getAttribute("data-conductor-clipboard");
  if (encoded) {
    try {
      const metadata: unknown = JSON.parse(decodeURIComponent(encoded));
      if (metadata !== null && typeof metadata === "object"
        && "schemaVersion" in metadata && metadata.schemaVersion === 1
        && "kind" in metadata && metadata.kind === "file-contents"
        && "path" in metadata && typeof metadata.path === "string"
        && (!("language" in metadata) || typeof metadata.language === "string")) return true;
    } catch { /* Invalid metadata falls through to ordinary clipboard text. */ }
  }
  const attachments = Array.from(document.querySelectorAll("[data-conductor-cloud-attachment]"));
  return attachments.length > 0 && attachments.every((element) =>
    element.hasAttribute("data-conductor-source-session-id") && element.hasAttribute("data-conductor-source-attachment-id"));
}

export function longPasteAttachment(clipboard: PasteData, enabled: boolean, now = new Date()): File | null {
  if (!enabled) return null;
  const text = clipboard.getData("text/plain");
  const html = clipboard.getData("text/html");
  const files = Array.from(clipboard.items).filter((item) => item.kind === "file");
  const imageTable = files.every((item) => item.type.startsWith("image/")) && text.trim().length > 0 && /<table[\s>]/i.test(html);
  if (files.length > 0 && !imageTable) return null;
  if (hasReferenceMetadata(html) || clipboardComposerParts(clipboard.getData(COMPOSER_CLIPBOARD))) return null;
  if (!text || (text.length <= 5000 && text.split("\n").length <= 90)) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return new File([text], `pasted_text_${stamp}.txt`, { type: "text/plain" });
}
