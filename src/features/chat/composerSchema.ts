import { Node, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Fragment } from "@tiptap/pm/model";
import { fileIconName, folderIconName, materialIconUrl } from "../../components/fileIconNames.ts";
import { readComposerDraft, type ComposerPart } from "./composerDocument.ts";

export const FileAtom = Node.create({
  name: "fileMention", group: "inline", inline: true, atom: true, selectable: true,
  addAttributes: () => ({ path: { default: "" }, label: { default: "" }, directory: { default: false } }),
  renderHTML({ node }) {
    const path = String(node.attrs.path);
    const label = String(node.attrs.label);
    const icon = node.attrs.directory ? folderIconName(false) : fileIconName(path);
    return ["span", { class: "oc-file-chip", "data-mention-path": path, contenteditable: "false", title: path },
      ["img", { src: materialIconUrl(icon), width: 12, height: 12, alt: "", draggable: "false", "aria-hidden": "true" }],
      ["span", {}, label]];
  },
});

export function inlineContent(parts: readonly ComposerPart[]): JSONContent[] {
  return parts.flatMap((part): JSONContent[] => part.kind === "file"
    ? [{ type: "fileMention", attrs: { path: part.path, label: part.label, directory: part.directory } }]
    : part.text.split("\n").flatMap((text, index) => [...(index ? [{ type: "hardBreak" }] : []), ...(text ? [{ type: "text", text }] : [])]));
}
export function composerContent(draft: string): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: inlineContent(readComposerDraft(draft)) }] };
}
export function partsFrom(fragment: Fragment | ProseMirrorNode): ComposerPart[] {
  const parts: ComposerPart[] = [];
  let paragraph = false;
  fragment.descendants((node) => {
    if (node.type.name === "paragraph") {
      if (paragraph) parts.push({ kind: "text", text: "\n" });
      paragraph = true;
    }
    if (node.isText) parts.push({ kind: "text", text: node.text ?? "" });
    else if (node.type.name === "hardBreak") parts.push({ kind: "text", text: "\n" });
    else if (node.type.name === "fileMention") parts.push({ kind: "file", path: String(node.attrs.path), label: String(node.attrs.label), directory: node.attrs.directory === true });
  });
  return parts;
}
export function linearDocument(doc: ProseMirrorNode): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [1];
  doc.forEach((paragraph, offset, index) => {
    if (index > 0) { text += "\n"; positions.push(offset + 1); }
    paragraph.forEach((node, childOffset) => {
      const value = node.isText ? node.text ?? "" : node.type.name === "fileMention" ? "\ufffc" : "\n";
      for (let i = 0; i < value.length; i++) positions.push(offset + childOffset + i + 2);
      text += value;
    });
  });
  return { text, positions };
}
