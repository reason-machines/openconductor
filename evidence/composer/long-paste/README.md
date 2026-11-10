# Composer long-text paste conversion

Conductor Rebuild, 2026-11-10. Source unit COMPOSER-LONG-PASTE-135-01. This is a plain-text conversion contract, not native clipboard, OS writing assistance, cloud attachment copying, or complete composer parity.

## Retained reference and connected control

Conductor 0.87.6's previously retained `renderApp-D_fmY7hW.js` has SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (rechecked in this pass). Installed-app identity and REA provenance are recorded in [the Composer reference](../../chat/composer/current/README.md#source-identity-and-evidence). REA analysis `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` has a partial graph; the complete literal spans below supplement it. They are zero-based, half-open UTF-8 **byte** ranges, not decoded character offsets. No new extraction, analyzer, native interaction, or reference execution occurred. [Existing REA gaps](../../chat/rea-gaps.md) remain applicable.

- Complete `pwo` classifier, bytes `[8434849,8435573)`, SHA256 `763f51a59df78396f0012a03edecf3ab1139d3f85cc216e600fc3aabc4fb4bc5`.
- Complete `gwo` dispatch, bytes `[8435856,8437496)`, SHA256 `4ad3a31e6ea7e90e6a2c365ba95628faae1becd0ea16194a30011c9bc540505a`.
- Complete `Two` predicate and `Awo` file constructor, bytes `[8441490,8441648)`, SHA256 `3767e6f2c7bcdaa1eeb07f39749b4b93c073633195a1ba179083f46b65c5bf98`.
- Complete `DNi` callback wiring, bytes `[8645203,8645887)`, SHA256 `c5f6b222ab98af94fb716f2a3e1fe63773956bf84d2992d4deb351dcd5f3b418`.
- Complete `Ewo` image/table exception, bytes `[8440742,8440940)`, SHA256 `8e5daf20f2007a65022353af616941a98b4cc5db2a87c994ea87ec1c6dc46602`.
- Complete `F$r` file-content metadata decoder, bytes `[738721,738925)`, SHA256 `c26207cd384a114a156e46332a412f4cb90da5d514fea5f5bc60e375ad9a5442`.
- Complete `Yxo` cloud metadata decoder, bytes `[8382491,8382871)`, SHA256 `dfe8d4bc26dfd992b14fb731eccc2eb5dc9bc51e049783237a4d64e253942ca7`.

`Two` requires nonempty text and either `text.length > 5000` or `text.split("\n").length > 90`. Length uses JavaScript UTF-16 code units, not UTF-8 bytes or Unicode code points. The unnormalized clipboard text becomes a `text/plain` File named `pasted_text_YYYY-MM-DD_HH-mm-ss.txt` using local time (`Dai`, complete bytes `[432092,432356)`). `gwo`'s long-text branch prevents default, stops propagation, and forwards exactly one file to `attachFiles`. `DNi` supplies this callback to the composer form's `onPasteCapture`; the retained `M6` attachment callback forwards nonempty arrays to the existing attachment mutation. Both the composer and settings read getter `zDt` with default true. The imported getter implementation was not newly acquired.

Classifier precedence is significant: compressed directories; ordinary files unless all file items are images with nonempty text and HTML matching `/<table[\s>]/i`; recognized file-content HTML metadata; recognized cloud attachment metadata; only then long text. File-content metadata is URI-decoded JSON in `data-conductor-clipboard` with `schemaVersion: 1`, `kind: "file-contents"`, string `path`, and optional string `language`. Cloud metadata requires all `data-conductor-cloud-attachment` elements to have both source-session and source-attachment attributes. Those higher-priority formats are not implemented by this unit and must not be reclassified as plain long text. OpenConductor's valid custom atomic-composer clipboard payload must also keep its existing editor path.

## Current-source mismatch and scope

At main `d9b8d335f93c13176640436b89a75d8c9a2ea209`, `auto_convert_long_text` occurs only in settings/preferences/tests. Composer has no paste-capture conversion. ComposerEditor accepts existing files, then custom atoms or ordinary normalized text. The setting therefore has no conversion consumer.

The exclusive five-file lease permits only Composer imports, the existing `useBoolPref` consumer, paste capture, and form binding; new `composerLongPaste.ts`, its unit test, this evidence note, and `tests/e2e/composer-long-paste.e2e.mjs`. No editor/props, settings-hook, WorkspaceView, attachment service, queue, ModelPicker, Stop, shared fixture, workflow, dependency, or native edits. Existing `onAttachFiles(File[])` and `useBoolPref` are reused. Native paste-as-paths and #847 remain stopped.

## Regression-first verification

The first published increment adds the mounted regression and this evidence note only; product code is unchanged. Normal automatic hosted `npm run test:e2e` must establish baseline RED before the product change. The new test mounts the existing demo application in Chromium and uses clipboard writes plus real paste key presses, not a copied handler or source-string assertion. It asserts conversion above either threshold, one attachment and no duplicate text or replacement of the existing draft; disabled preference, exact lower boundaries, ordinary paste/Undo, and recognized metadata precedence remain controls.

### Baseline RED retained before the product correction

At published head `24a1650c09d4787ac5e2eca9e6918d87cbb97f9b`, [automatic hosted E2E job 129815207181](https://github.com/reason-machines/openconductor/actions/runs/42811907292/job/129815207181) failed exactly the two conversion cases. The 5001-code-unit paste reported editor length 5016 and zero attachments; the 91-line paste reported editor length 288 and zero attachments. Both timed out waiting for the attachment chip. Disabled preference, exact lower boundaries/ordinary Undo, recognized metadata precedence, and the neighboring paste Undo/Redo test passed. These results establish missing mounted conversion, not a setup failure.

The correction reads the existing boolean preference in Composer, classifies the paste at form capture, and passes exactly one raw text File to the existing attachment callback while preventing duplicate editor insertion. Ordinary files (except the retained image/table case), recognized reference metadata, and valid OpenConductor atomic clipboard data remain on their existing paths. The original four mounted regression tests are unchanged. An additional event-dispatched mounted control covers file/image-table/custom-atom precedence; it is synthetic DOM input, not native clipboard proof.

- Passed: retained renderer and bounded-span hashes; source comparison; JavaScript syntax and whitespace checks; all seven focused pure long-paste tests (thresholds, UTF-16 units, unnormalized content, local filename, disabled setting, ordinary files/images, valid/invalid custom atom payloads).
- Pending: unchanged mounted regression GREEN, additional mounted precedence controls, exact-head CI, merged-main behavior, and automatic package proof.
- Not run: local app/browser/native runtime, installation, build, workflow dispatch/rerun, reference acquisition, native/WebKit clipboard behavior, attachment delivery to a real agent, or OS clipboard/native parity.
- No screenshot: no local browser admission is held. Hosted behavioral results will be retained separately from visual/native acceptance; no screenshot or native parity is claimed.
