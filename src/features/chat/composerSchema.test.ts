import { test } from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { EditorState } from "@tiptap/pm/state";
import { FileAtom, composerContent, inlineContent, linearDocument, partsFrom } from "./composerSchema.ts";
import { composerPrompt, writeComposerDraft } from "./composerDocument.ts";
import { fileMentionQuery } from "./fileMentions.ts";

const schema = getSchema([Document, Paragraph, Text, HardBreak, FileAtom]);
const prompt = (state: EditorState) => composerPrompt(writeComposerDraft(partsFrom(state.doc)));

test("newlines and trailing blank lines survive editor document restoration", () => {
  for (const text of ["first\nsecond\n", "first\n\n", "\n", "📄\n@README"]) {
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON(composerContent(text)) });
    assert.equal(prompt(state), text);
  }
});

test("mention completion after native multi-paragraph input preserves surrounding text and Unicode", () => {
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "📄 Review" }] },
    { type: "paragraph", content: [{ type: "text", text: "Look @src/old.ts then test" }] },
  ] }) });
  const { text, positions } = linearDocument(state.doc);
  const caret = text.indexOf("@src") + 4;
  const range = fileMentionQuery(text, caret);
  assert.ok(range);
  const file = { kind: "file", path: "src/new.ts", label: "new.ts", directory: false } as const;
  const nodes = inlineContent([file]).map((node) => schema.nodeFromJSON(node));
  state = state.apply(state.tr.replaceWith(positions[range.start], positions[range.end], nodes));
  assert.equal(prompt(state), "📄 Review\nLook @src/new.ts then test");
  assert.equal(linearDocument(state.doc).text, "📄 Review\nLook \ufffc then test");
});

test("selected atom copies its full path while partial text copies only selected text", () => {
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(composerContent(writeComposerDraft([
    { kind: "text", text: "Review " },
    { kind: "file", path: "src/folder/a.ts", label: "a.ts", directory: false },
    { kind: "text", text: " please" },
  ]))) });
  const copy = (from: number, to: number) => composerPrompt(writeComposerDraft(partsFrom(state.doc.slice(from, to).content)));
  assert.equal(copy(8, 9), "@src/folder/a.ts");
  assert.equal(copy(1, 4), "Rev");
});
