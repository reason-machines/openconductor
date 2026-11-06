import { test } from "node:test";
import assert from "node:assert/strict";
import { readComposerDraft, writeComposerDraft, composerPrompt, appendComposerText, clipboardComposerParts, type ComposerPart } from "./composerDocument.ts";

test("ordinary and marker-looking text round-trip without becoming file atoms", () => {
  for (const text of ["", "Review\n\n", "@⟦README⟧(readme.md)", "\u001eOpenConductorComposer:1\n[]", "\u001eOpenConductorComposer:1\nnot JSON"]) {
    const draft = writeComposerDraft([{ kind: "text", text }]);
    assert.deepEqual(readComposerDraft(draft), [{ kind: "text", text }]);
    assert.equal(composerPrompt(draft), text);
  }
});

test("file atoms persist paths and labels without leaking the storage envelope to an agent", () => {
  const parts: ComposerPart[] = [{ kind: "text", text: "Review " }, { kind: "file", path: "docs/📄 (50%) ⟧.md", label: "📄 ) ⟧\n", directory: false }, { kind: "text", text: "\nthen test\n" }];
  const draft = writeComposerDraft(parts);
  assert.deepEqual(readComposerDraft(draft), parts);
  assert.equal(composerPrompt(draft), 'Review @"docs/📄 (50%) ⟧.md"\nthen test\n');
});

test("review notes append without corrupting persisted file atoms", () => {
  const file: ComposerPart = { kind: "file", path: "src/index.ts", label: "index.ts", directory: false };
  const draft = writeComposerDraft([file, { kind: "text", text: " \n" }]);
  assert.deepEqual(readComposerDraft(appendComposerText(draft, "Review note")), [file, { kind: "text", text: "\n\nReview note" }]);
  assert.equal(composerPrompt(appendComposerText("  ", "Review note")), "Review note");
});

test("clipboard data rejects malformed atoms and unknown types, preserving valid segments", () => {
  for (const data of ["not json", "null", "{}", '[{"kind":"html","text":"<img>"}]', '[{"kind":"file","path":"","label":"x","directory":false}]', '[{"kind":"file","path":"x","label":"x"}]']) assert.equal(clipboardComposerParts(data), null);
  const parts: ComposerPart[] = [{ kind: "file", path: "src/index.ts", label: "index.ts", directory: false }];
  assert.deepEqual(clipboardComposerParts(JSON.stringify(parts)), parts);
});
