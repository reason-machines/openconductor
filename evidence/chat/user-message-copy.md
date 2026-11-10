# Sent-user clipboard file labels

Conductor Rebuild owns `SENT-USER-COPY-LABELS-BE7-02`. This change affects only the text handed to the sent-user Copy button. Rendering, provider prompts, retry, export, fork text, attachments, and full-message disclosure are outside the change.

## Retained reference source

The source-only handoff retains Conductor 0.87.6 bytes associated with REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`:

- `renderApp-D_fmY7hW.js`: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`: SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Original packet receipt: 10,998 bytes, SHA-256 `73b8f1101c3214395158564414497dcbcf49adf9d8ee7323d5252b1db3fa5345`.

The producer `eQo` obtains the original display name and supplies it separately from the encoded path to editor insertion `a5o` and fallback `LDt`/`R8`/`au`. User renderer `WOo` selects the same `Nt` for visible rich content and `text: Bwr(Nt)`. The renderer imports `mg` as `Bwr` from the pinned index; that export resolves to `jB`, which copies ordinary encoded file atoms as unquoted `@displayLabel`. Button `t0` forwards that text to `l1`, which writes it unchanged at the clipboard boundary.

Relevant UTF-8 half-open ranges are:

- Renderer `WOo`: `[8888340, 8895883)`; producer `eQo`: `[9753919, 9755998)`; insertion `a5o`: `[8390642, 8390890)`.
- Renderer import: `[52991, 66495)`, 13,504 bytes, SHA-256 `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5`.
- Index normalizer `jB`: `[1387641, 1387922)`; serializer `au`: `[1387043, 1387118)`; insertion `R8`: `[1388506, 1388675)`.
- Renderer button `t0`: `[1793169, 1794797)`; clipboard `l1`: `[739306, 739397)`.

The unchanged packet verifier passed 17 span hash/width checks, six joins, and 12 main-file locks at `0244d800782a3eaf811aac53fedc8a536218fb2b`. This Session independently checked receipt transport and the retained spans, not the complete original assets. Full-asset provenance remains the [source owner's audit](https://reasonmachines.com/agents/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b).

## Current OpenConductor path

At checked main `0244d800782a3eaf811aac53fedc8a536218fb2b`, the picker retains `path` and `label` separately. `composerPrompt` quotes whitespace paths using `JSON.stringify`; `submittedUserPrompt` captures the typed parts separately. Queue submission, runtime start, and persistence keep that metadata without replacing provider text. `buildRows` derives the user row's text from `plainText(message)`. User `Row` renders its rich content but hands raw `row.text` to `MessageActions`, which forwards it to `CopyButton` and `navigator.clipboard.writeText` unchanged.

The correction must validate typed metadata and its exact serialized first-body join before using labels. Literal text and subsequent text blocks must remain in order. Missing, invalid, or mismatched metadata must copy raw text. No string search-and-replace or inference of labels is allowed.

## Regression and verification

The test-only checkpoint adds `userMessageCopy.test.ts`. It executes production submission, queue, turn creation, row building, user `MessageActions`, and the actual `CopyButton` click callback inside an isolated Node VM. The fixture loads the real production copy helper once `Transcript` imports it. It does not substitute normalization behavior.

Cases cover whitespace paths, different labels, repeated atoms beside literal mentions, multiline Markdown and HTML-like text, quoted paths, directories, label whitespace, submission trimming, attachment captions, later text blocks, legacy copy, malformed metadata, mismatched bodies, and assistant copy. Each user copy checks provider text, retry, export, fork text, and message immutability.

- Passed locally: retained-source validation and `git diff --check`.
- Hosted RED and GREEN: pending at the test-only checkpoint. The regression SHA-256 is `8e5577966a890020a9b3eab49e837696aaa74565f4fed478595c745921ef5faa`; it must remain unchanged through the correction.
- Not run locally: Node, typecheck, tests, builds, browser, native, provider operations, dependency installation, or reference JavaScript execution.

## Evidence limits

Original renderer semantic analysis stopped after heap exhaustion. The retained decoded shipped bytes are static source evidence, not new REA semantic nodes or runtime observations. No screenshot exists because browser and native execution are excluded from this lane. The regression proves the selected production callback path under hosted Node, not a packaged macOS clipboard, visual parity, or side-by-side behavior. #847 and #916 remain stopped; #947 rendering ownership and parked full-message disclosure are unchanged.
