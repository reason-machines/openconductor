# Submit prompt — pending shortcut hint

Conductor Rebuild / SAME6013 / `SUBMIT-PROMPT-PENDING-HINT-6013`.

## Retained-source contract and correction

Re-read default branch `a793c0f2f5c5d6f8f00860d31cec9053a0e99744`. `SubmitPromptDialog.tsx` changes its button label to “Submitting...” while an opener is pending, but independently renders the idle shortcut span. A configured default or custom shortcut therefore remains visible on the disabled pending button.

The retained real-Conductor renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, from REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The pre-existing extraction lineage is in `../submit-prompt-rejection/reference.json`. No new original-app acquisition or execution is claimed.

`source.json` pins eight complete declarations/expressions and nineteen current source identities. Zero-based UTF-8 half-open ranges:

- Direct `W5a` mount `[11141121,11141134)` → complete `W5a` `[11132912,11134847)` sets pending before awaiting `V5a` `[11132569,11132912)`, preserves fields on rejection, and clears pending in `finally`.
- Button children `[11134660,11134834)` are **only** “Submitting...” while pending; the idle branch contains both “Submit prompt” and the shortcut span.
- Complete button `tt` `[1923125,1923712)` forwards those supplied children through `S3i` `[1920998,1921053)` and native rendering `[465319,466387)`. Full prop-composition helpers `[463925,465319)` preserve children, rather than injecting another hint.

The minimal treatment is one additional `!opening` guard on the existing shortcut span. No submission service, shortcut dispatch/provider, wrapper, motion, dismissal, field, styling or legacy-test change is needed. OpenConductor's intentional GitHub issue-draft adaptation is unchanged: an opener resolving is not evidence that an issue was submitted.

## Frozen reproduction

The dedicated regression mounts the actual component, real `KeybindingsProvider`, override parser, registry, shortcut display and submission URL builder. Only the external opener, motion ref and DOM listener ports are inert. It invokes the actual form callback, not a trusted keyboard event. The opener is a synthetic deferred promise; no URL is opened and no real IO runs.

The canonical nine-test fixture SHA-256 is `680bec20893cda8756929862903cbf7157eb9931dc583281b2a766a22004199d`. The exact bytes were frozen before the canonical baseline and are preserved in `baseline/submitPromptPendingHint.test.ts.txt`.

- Baseline: **7 passed / 2 intended assertion failures**. Default `⌘↵` and custom `⌘D` hints remain during pending instead of disappearing.
- Existing adjacent submission and URL tests: **10/10 passed** before product edits.
- Controls cover idle default/custom hints, invalid persisted shortcut fallback, rejection preserving fields and restoring hints, retry, awaited success, disabled pending fields, duplicate-submit protection and blank submission.

Commands:

```bash
node --test src/components/submitPromptPendingHint.test.ts
node --test src/components/submitPromptSubmission.test.ts src/components/submitPrompt.test.ts
python3 evidence/dialogs/submit-prompt-pending-hint/verify.py
```

The initial fixture incorrectly assumed a persisted empty shortcut list disabled its command. Actual `parseOverrides` intentionally rejects empty lists and falls back to the default. `pre-freeze-v1/` preserves that original fixture, hash and log. Only that new control was corrected to test the actual stored-input fallback; the two pending counterexamples and all other tests remained unchanged. That setup failure is not an additional intended RED, a product defect or an edited legacy assertion.

## Verification boundaries

- The **same frozen nine tests passed 9/9** after the one-line treatment; adjacent original tests passed **10/10** again, with zero skips/cancellations.
- `python3 evidence/dialogs/submit-prompt-pending-hint/verify.py` **passed**: original asset, eight complete source bindings, nineteen current source pins, immutable fixture, exact one-line product change and no legacy-test edits.
- `npm run build` **passed** on local head `365558970b61bcc3c6a58c79311be6d40b85c035`, including branding, full TypeScript and Vite (65 seconds). Existing large-chunk warnings remain.
- `npm run lint:colors` **passed**: six tests and 1,273-file scan. The sole heavy slot was released at **18:50:23.992649Z**, own compiler/build processes empty. Commands ran sequentially in the foreground.
- Browser visible proof is **pending separate serialized admission**; no browser/server/native runtime was started for these checks.

Source and mounted callback checks do not establish full-App, live-original, macOS/WebKit, native/provider or packaged behavior. Existing native/release custodians retain their lanes.
