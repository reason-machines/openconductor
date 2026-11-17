# Settings Actions prompt Preview

Conductor Rebuild · SETTINGS-ACTION-PREVIEW-49 · 17 November 2026

## Contract and fresh baseline

Checked and integrated main `9f676a74b9763eacfced2489b01a81163900bed9` with an identical tree before editing. This is distinct from the closed async, scrollback, remembered-repo, search-reveal, font and completion work. Ledger collision clearance covers only PromptRows, its scoped CSS additions, the new preview adapter/test, one pure preview IPC and its matching registration, plus this evidence directory.

`reference.json` preserves 31 complete REA-retained declarations/aliases/callers from the real Conductor 0.87.6 renderer and index. Both whole originals were rehashed on Reason Cloud:

- Renderer: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

`Q3a → S6e → yzi → xzi → vho/fGt` exposes Preview in five expanded action editors; General explicitly suppresses it. `xzi` opens an action-titled dialog and renders the current editor draft through `cSe.getPromptPreview`. The index alias closes to `wg.getPromptPreview:Twt`, which uses the same pure builders as ordinary action consumers, with sample branch/target context. Original JavaScript is inert data; none was evaluated. Reference metadata describing earlier qualification-only status is historical, not the treatment's state. No new REA command ran or new REA gap occurred; upstream extraction/semantic-analysis limits remain.

The exact frozen original fixture has SHA-256 `4ea0b334018ef8b5e8d1677978bb42261c507a509e47069d5716aff6a5d7c85b`. On fresh unchanged main:

```bash
node --test --test-concurrency=1 .oc-tmp/settings-action-preview/preview.test.cjs
# 2 passed / 5 intended missing-Preview assertion failures; no setup failures
```

`red-current.tap` and the complete baseline component are retained. Assertions after the absent-button gate were not exercised on baseline. They pass in the mounted treatment below.

## Minimal treatment

- Five expanded action editors expose a muted Preview link and a scrollable, prompt-titled Markdown dialog. General remains suppressed. Existing autosave, timer, blur, effective settings and routes are unchanged.
- `actionPromptPreview.ts` reuses real `buildReviewPrompt`, `fixErrorsInstructions` and `withRenameBranch`. Rename follows OpenConductor's existing first-message adaptation, using `${YOUR_MESSAGE}`; it does not invent a standalone rename action or copy Conductor's prompt wording.
- Create PR and Resolve conflicts use the existing pure Rust builders through one new `pr_action_prompt_preview` IPC. Its arguments are **only kind and current draft**. It accepts no repository/workspace paths and performs no settings/file reads, git, action or provider execution. Sample context mirrors the retained preview: origin, branch/target/title/description placeholders and a rebase example. Normal wrappers and all action builders remain byte-identical.
- Loading, explicit preview errors and discarded late responses are owned by the dialog. Preview itself does not directly save. A real pointer click can independently blur and save the editor through the existing path; physical blur/persistence is outside the fixture.

## Verification on Reason Cloud

```bash
node --test --test-concurrency=1 src/settings/actionPromptPreview.test.ts
# PASS 14/14, including all seven frozen test bodies and assertions unchanged

node --test --test-concurrency=1 \
  src/settings/actionPromptPreview.test.ts \
  src/settings/rows/rowModel.test.ts src/settings/prompts.test.ts \
  src/settings/settingsSearchActivation.test.ts src/settings/settingsSearchReveal.test.ts \
  src/features/diff/review.test.ts src/features/pr/checks/fixErrors.test.ts
# PASS 54/54 = 14 focused + 40 adjacent

python3 evidence/settings/action-preview/verify.py
# PASS 63 whole-original/span/freeze/baseline/source/scope checks

npm run lint:colors
# PASS six lint tests and full source scan
rustfmt --edition 2021 --check src-tauri/src/pr/commands.rs
# PASS
git diff --check
# PASS
```

Harness ports are explicit: `mounted.cjs` adds a recursive local TypeScript module loader and the single **controlled pure preview IPC boundary**. DialogFrame and Markdown remain host stubs. Every original test body/assertion from `frozen/preview.test.cjs` is byte-identical. The mounted tests exercise actual PromptRows and preview adapter/TS builders; controlled native responses are not native execution or proof of Rust content. Supplemental tests cover blank/whitespace/custom drafts, exact TS-builder equality, IPC argument shape, close, load failure and late-response isolation. None launch an action, provider, real persistence operation or timer.

The separate bounded `test-rust-preview.py` probe extracts the exact production IPC function body, omits only its Tauri attribute for standalone compilation, and links the real unchanged `prompt.rs`. It tests actual Rust builder output equality, blank/trim behavior, placeholders/rebase and unknown-kind rejection. **Prepared and queued; not yet run at this milestone.** Its execution must use the existing serialized compiler slot. Even a passing probe does not compile the Tauri macro/transport or exercise a native app.

## Acceptance limits

No screenshot/recording: this lane has no browser/native/runtime admission, and sole runtime/package custody remains with the existing owners. Actual pointer/keyboard/focus/blur, Markdown paint/layout, native Tauri registration/transport, real disk persistence and packaged/installed behavior remain unverified. No overlapping dispatch, app/provider launch, Cargo/full app build or local frontend heavy check ran. Hosted exact-head typecheck/build and full unit tests are pending publication and must all pass before merge. Native/package acceptance is not claimed by mounted calls, source identities or a merge.
