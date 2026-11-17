# API-key Save pending feedback

Author: Conductor Rebuild.

## Narrow source repair

The only product edit replaces SecretInput's pending `Saving…` text with the existing SecretRow Remove working graphic in `src/settings/agents/kit.tsx`. It uses the same decorative 16px SVG and existing loader class; the existing `ag-sr-only` utility retains `Saving…` as nonvisual text. No new helper or style is introduced. The idle Save label, button props, input, Cancel, trimming, duplicate-submit guard, save/error/finally handlers, provider tabs, legacy parts, Remove/reveal/copy, terminal, login, picker and cloud behavior are untouched.

Fresh main was fetched and inspected at `c821b27519ab1831cf62dce6d236337bf75cc3e0`. Thirteen checked/protected files matched main before the product edit. The [source receipt](source.json) pins their Git blobs and SHA-256 hashes and records the single-JSX-region scope comparison after the edit.

## Retained real-Conductor contract

The existing REA lineage is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The source archive is SHA-256 `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`; its renderer is SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

Six retained fragment lengths and SHA-256 digests were revalidated. No Conductor JavaScript was evaluated:

- [`jpa`](../secret-remove-pending/reference/jpa.txt) and [`Fpa`](../secret-remove-pending/reference/Fpa.txt) join the Anthropic/OpenAI API-key forms to YWt.
- [`YWt`](../secret-remove-pending/reference/YWt.txt) sets the save-pending flag before the promise, supplies it to n$i, and clears it in `finally`.
- [`n$i`](../secret-editor-traversal/n_i.literal.txt) declares `pending ? ri({type:"working",className:"size-4"}) : "Save"` while disabling the pending submit.
- [`ri`](../secret-remove-pending/reference/ri.txt) and [`Kss`](../secret-remove-pending/reference/Kss.txt) resolve the working-loader representation.

This is historical shipped-source evidence requalified against current implementation, not a new native observation. The existing REA renderer-analysis limitation is not retested or waived. No new REA acquisition, failure or bug occurred. The SVG follows OpenConductor's already-delivered Remove precedent; exact sprite, animation and pixel fidelity are not claimed.

## Frozen regression

The [original stdin investigation](frozen-investigation.cjs) was recovered from this Session's retained complete command and verified against its previously recorded SHA-256:

`aef9bc36c77c271f60f5562c3867ba6001cc262de8211a868eb0015e6928380e`

The permanent [Node-discoverable TypeScript test](../../../src/settings/agents/secretSavePending.test.ts) adapts only module imports, helper type annotations, `createRequire(import.meta.url)`, and the source reader (current file or explicit `SECRET_SAVE_SOURCE_FILE`, rather than hardcoded historical `git show`). All six original test case bodies remain byte-identical. Their shared SHA-256 is `4dfc5335c56df5aa96e266b339aff6923e104ace35c358247cb0eb98f0fbe381`.

The full TS fixture was frozen before the fresh RED. Its SHA-256 remained `ba3017b5fcfc86d51a58c8590152b76e102f47900d89e88add8dcd6e1f557ea7` through RED, GREEN and adjacent checks, as recorded by [before](validation/fixture-before.sha256) and [after](validation/fixture-after.sha256) receipts.

The fixture mounts the actual SecretRow/SecretInput with each real provider label, not the complete ClaudeTab/CodexTab. The two callers are statically inspected and pinned separately. It uses a deferred synthetic save and a fixture-only value; real provider, credential, delete, reveal, URL and native boundaries are forbidden. It tests resolve/reject pending lifetimes, cleanup, unchanged error text, disabled input/Save/Cancel, trimming, blank input, duplicate submissions and retained rejected input.

The exact same command ran before and after the product edit, on this Session's Reason cloud computer with existing dependencies only:

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/agents/secretSavePending.test.ts
```

- [RED](validation/red.txt): exit 1, exactly four missing-indicator assertions (`actual 0`, `expected 1`), two controls passed; no setup/import failures or skips.
- [GREEN](validation/green.txt): exit 0, all six cases passed, no skips.

## Additional checks

[Focused and adjacent secret controls](validation/adjacent-secret-controls.txt) passed 23/23, exit 0:

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/agents/secretSavePending.test.ts \
  src/settings/agents/secretRemovePending.test.ts \
  src/settings/agents/secretRevealLabel.test.ts \
  src/settings/agents/secretEditorKeyLink.test.ts \
  src/settings/agents/kitModel.test.ts
```

- `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck`: [passed](validation/typecheck.txt), exit 0.
- `npm run build`: [passed](validation/build.txt.gz), exit 0; existing large-chunk warnings retained.
- `npm run lint:colors`: [passed](validation/colors.txt), exit 0.
- `git diff --check`: passed.
- Static comparison passed: only pending Save child JSX differs from the main kit; the Remove and Save SVGs are whitespace-normalized byte-equal; all protected source pins and the test fixture remain unchanged.

The optional broad `src/settings/agents/*.test.ts` run was **partial**, not green: [126/128 passed](validation/adjacent-agents.txt.gz). The two DOM wrappers require an isolated `jsdom@26.1.0` prefix. The first run had no `ONBOARDING_DOM_DEPS`. A second run [explicitly reused the existing `.qa/onboarding-dom-deps` directory](validation/adjacent-agents-configured.txt.gz), but that directory lacks the jsdom package; the same two tests failed setup, 126/128 passed. No install, fallback, skip, test weakening or product workaround was made. Hosted CI's existing isolated dependency setup is separate validation.

## Post-merge main revalidation

After selection PR #1386 merged, main was fetched at `8e1c32c3f05efc1562177ea91ad3adccc940c7fe` and merged into this Session's assigned branch. [The refreshed source receipt](validation/merged-main-source.json) verifies all six retained reference spans, all thirteen original main-file pins, the original frozen investigation, and the unchanged permanent test hash. The only source differences from that main are the pending Save JSX and its new test; no selection/terminal changes remain in this PR.

The unchanged test against a temporary source copy of `origin/main:src/settings/agents/kit.tsx` (`SECRET_SAVE_SOURCE_FILE`) again produced exactly [four assertion failures and two passing controls](validation/merged-main-red.txt), exit 1. The same fixture against the repair plus the four adjacent secret-control files [passed 23/23](validation/merged-main-green-adjacent.txt), exit 0. The commands and fixture were otherwise unchanged from the checks above. [Fresh-main typecheck](validation/merged-main-typecheck.txt) also passed, exit 0; `git diff --check` passed. Existing build and color-lint results above remain historical, with exact-head hosted CI providing the new integrated checks.

Bounded reuse investigation found no existing `jsdom` package under this checkout's `.qa` or `node_modules` (depth five). The earlier optional broad local agents suite remains partial rather than claiming a recovered pass; no dependency installation was performed. The repository's automatic frontend CI provisions its own isolated DOM prefix and runs the broader frontend suite.

## Acceptance not established

No app/browser/native runtime, screenshot, Mac dispatch, install, provider/credential operation, Rust check, manual workflow dispatch or package build was performed. `react-test-renderer` does not load CSS. Visual appearance, animation, native accessibility, package inclusion and side-by-side acceptance are NOT_RUN/unverified. No screenshot is supplied because product runtime is explicitly excluded.

On a containing package, sole native executor E1 can later check inert configured Anthropic and OpenAI rows: idle Save; one fake save; one 16px pending graphic with the existing disabled controls; success exits the editor; rejection restores Save and the unchanged error. Do not use real credentials to obtain proof. This document does not dispatch or authorize that future run.
