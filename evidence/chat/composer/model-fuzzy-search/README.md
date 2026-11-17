# Abbreviated model-search membership

Conductor Rebuild · `COMPOSER-MODEL-FUZZY-135` · baseline main `91de35a7e10199675bc43d9b29516cd8ec18f4a0`.

## Proven gap and bounded repair

The actual ModelPicker items callback drops `cld`, `cdx` and `gpt56` because it requires a literal substring in a model name, ID, agent label or qualified ID. Retained Conductor `L7o → A7o → R7o → lj → KBt/mys` establishes noncontiguous fuzzy matching. Thirteen retained source-span SHA-256 checks pass; exact inert text and ranges are in [source.json](source.json). The [existing source-audit page](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3?page=0c58efb0-2de0-4ad2-aa79-67115c65d420) retains the earlier packet and provenance. No new REA acquisition occurred.

The production change imports the already-pinned `fuzzysort` 3.1.0 dependency and replaces each per-word/per-field literal match with `fuzzysort.single`. This follows the existing field-matching integration in `src/keybindings/fuzzy.ts`; slash commands already use the same library for the retained `lj` contract. It adds no dependency, transport or provider behavior.

This is a membership correction, **not complete model-search equivalence**. The existing field boundaries, whitespace behavior, physical input order, original choice objects, agent-resolution precedence and selection callbacks stay intact. Retained `lj` ranks its combined-string results; this patch does not restore that ranking, combined-field matching, highlighting, or first-result-on-Enter parity.

## Frozen regression

`src/features/chat/modelPickerFuzzySearch.test.ts` SHA-256:
`c3a7126bf8a94755f96b2a2920c84a6555a30443007788981a6edf6ad9ffc97f`.

The fixture extracts the actual production items callback and uses real model labels, choice ordering and agent lookup. Its oracle uses OpenConductor's existing independently implemented `matchCommands` pure adapter and the inert retained search contract, not evaluation of extracted Conductor source. It has no browser, native, network, provider or agent port.

- **RED:** `node --test src/features/chat/modelPickerFuzzySearch.test.ts` at the pinned baseline exits 1: **9 pass / 3 fail**. Exactly the three abbreviated queries fail; literal, multiword/whitespace, empty, no-match, order/identity and provider-precedence controls pass. Original output is [red.tap](red.tap).
- **GREEN:** the identical fixture passes all 12 cases after the repair. Its SHA-256 remains unchanged.
- **Adjacent:** `node --test src/features/chat/modelPicker*.test.ts` passes **140/140**, including unchanged interaction, disabled-state, loadout, qualified-ID, provider-label and effort assertions. [Corrected output](adjacent-corrected.tap). The additionally discovered `chatModelFriendlyLabel.test.ts` passes **5/5** after its same real-dependency namespace adapter.
- **Build:** `npm run build` passes branding, TypeScript checking and Vite compilation. The existing large-chunk warning remains.

Existing VM tests require a mechanical real-dependency namespace adapter because their TypeScript-to-CommonJS loader does not enable default-import interop. No test expectation or fixture scenario is changed.

## Intermediate checks and limits

The first combined-string candidate passed the new 12 cases but an unchanged adjacent control exposed a provider false positive (`custom claude`), and the component loaders lacked the CommonJS default export adapter. That intermediate output is preserved in `adjacent.tap.gz`. The final per-field matcher and real dependency namespace wiring resolve those failures without changing assertions.

The broad `node --test --test-concurrency=4 'src/**/*.test.ts'` attempt was **incomplete**: it exceeded 240 seconds, exposed one additional real-dependency VM loader consumer in `chatModelFriendlyLabel.test.ts`, and a current-Git-blob guard against the then-uncommitted ModelPicker. Source/log classification shows the nested Caffeinate `1 pass / 1 fail` text is the expected historical baseline RED, printed only after its enclosing qualification assertions succeed; it is **not** evidence of an unrelated current-product failure. The current Caffeinate graph's outer result was not reached before the timeout and remains unverified. That wrapper permits a 600-second child while this broad attempt had a 240-second outer limit; no hang or flaky cause is inferred. Original broad output is preserved in `full-source.tap.gz`. No full-suite pass is claimed; exact-head automatic CI remains the delivery gate.

Before the later qualification-only restriction against evaluating extracted vendor source arrived, a separate exploratory VM evaluated retained pure `mys`/`lj` text with no filesystem/network/native/provider ports. That initial comparison is not the approved frozen RED, was not repeated, and is retained separately in this Session's scratch evidence. The approved 12-case fixture never evaluates that text.

No visual screenshot is supplied: this source-only lane has no browser/native runtime admission, and no UI markup or styling changes. Native/WebKit behavior, installed-build identity, real provider delivery, app execution, ranking parity and full reference-app equivalence are **not verified**. No package dispatch, installation, native/provider execution, E1 action or new runtime watcher is part of this repair.
