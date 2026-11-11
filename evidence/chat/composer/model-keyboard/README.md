# Model search preserves unsent drafts

Conductor Rebuild, 2026-11-07. Baseline main is `810e40fc`. This increment changes only model-search Enter and Escape handling, not editor composition or agent execution.

## Reference evidence

A read-only identity check on Sven's `sven m5 max` confirmed installed Conductor 0.87.6 and binary SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. The copied decoded `renderApp-D_fmY7hW.js` hash remains `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

Fresh REA 6.8.0 browser captures ran on Reason Cloud against that decoded frontend with synthetic IPC, not the native app. Full scenario inputs and Evidence IDs are in [reference-captures.json](reference-captures.json).

- Searching `sonnet` produces matching models. Evidence `ev_d45329d93d478a3c688fd72fa1375754854c04d7a0c3bc97249cfe61855c746f`.
- Enter selects the first match, changes the chip to Sonnet 4.6, clears the query, and keeps the menu open. [Reference after Enter](reference-search-enter.png), Evidence `ev_03202a1a55771c63a058c837c981ca83244e3cd3a7322986bdcf5da55f5a9380`.
- Escape clears a nonempty query without closing the menu. Evidence `ev_cc10e501928216ce740e6ecb7afde8cabf573202ac6588a69cc0648e96bf1595`.

The reference after-Enter screenshot was viewed. Extracted strings and scripts were treated as data. No native app was launched or given input. No new REA failure occurred. Existing source-range and synthetic-IPC limitations remain in [chat REA gaps](../../rea-gaps.md).

## Failure and correction

The model-search input lives inside Composer's submitting form. Its Enter key had no local handler, so the browser's implicit form submission sent and cleared the chat draft. Escape closed the menu instead of first clearing its query.

`ModelPicker.tsx` now prevents Enter's form default at the search input. A nonempty matching query applies its first result through the existing `onChange` callback and clears search. Empty or unmatched search does nothing. Escape clears a nonempty search before closing an empty one. Mouse selection and other picker behavior stay unchanged.

[Before results](before-checks.json) record all four browser regressions failing on unchanged product code. Empty and unmatched searches emitted `{"text":"Keep this unsent draft","mode":"queue","files":[]}`. [After results](ours-checks.json) record all four passing after the fix.

The Cloud visible-Chrome check also selected Sonnet with Enter, observed an empty search and open menu, then closed it and verified the draft remained `Keep this unsent draft` with no submission. [OpenConductor REA captures](ours-captures.json) retain the isolated component's matching states. These are behavior checks, not a native-parity verdict.

## Rerun

Start the following foreground command through `preview_start` on the declared port. Bash and preview processes do not share localhost on this machine.

```bash
PORT=4437 ORIGIN=http://localhost:4437 OUTPUT=evidence/chat/composer/model-keyboard CHECK_COMPOSER=1 CHECK_MODEL_SEARCH=1 CAPTURE_COMPOSER=1 node tools/composer/serve.mjs ours model-search model-search-enter model-search-escape
```

For reference captures, make the authorized decoded frontend available at `.rea-work/dist`, then run through `preview_start`:

```bash
PORT=4438 OUTPUT=evidence/chat/composer/model-keyboard CAPTURE_COMPOSER=1 node tools/composer/serve.mjs reference model-search model-search-enter model-search-escape
```

Passed on Cloud:

- Four new browser regressions, plus the existing 13 composer interaction groups.
- `npm run build`, including branding validation and TypeScript.
- `npm run lint:colors`.
- `node --test --test-concurrency=2 "src/**/*.test.ts"`: 1,329 tests passed.
- `node --check tools/composer/capture.mjs`, `node --check tools/composer/model-search.check.mjs`, and `git diff --check`.

## Limits and ownership

Native WebKit, real IME, signed-in agent delivery, and final side-by-side native parity are not verified. The existing synthetic-composition checks passing is not IME proof. Full model-menu arrow navigation is outside this focused fix. Claude and Codex stay local to the Mac; no cloud agent execution or cloud UI was added.

Composer owner is Session `13576d11-76fb-4842-aa9b-c398f9ca26f3`. The composition-correction owner `3cf126be-0f20-4570-aea9-763c05ccb845` and ledger owner `ddfc6518-d50f-46a6-b83c-c3a18aa07e43` received the claim before product edits. Aggregate ledger files are left to their owner. Historical corrections remain preserved under local tag `archive/composer-handoff-13576d11`.
