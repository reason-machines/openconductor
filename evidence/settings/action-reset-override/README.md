# Actions Reset versus an empty local override

Conductor Rebuild · ACTIONS-RESET-OVERRIDE-49 · 17 November 2026

## Cause and narrow treatment

Checked fresh main `74c004a95d7b10072f54f71ca611f22c50944f64` (fetched again before treatment) has no Actions-row Setting actions/Reset control. Clearing a customized draft calls `promptWrite`, which emits `null` and deletes the local key. That incorrectly re-enables inherited instructions. A blank value supplied by local TOML already suppresses inheritance, but the resolver drops its sourced slot, hiding configured/source metadata from Settings.

The treatment distinguishes those operations:
- `PromptRows.tsx`: local rows expose the existing Base UI Setting actions/Reset menu, separate from the collapsible trigger; Reset sends null through the existing PendingEdit/write barrier and refreshes the inherited draft. It supersedes an unsaved queued draft. Hover/focus/open styling is scoped to the new affordance.
- `rowModel.ts`: normal draft saves preserve the trimmed string, including an explicit empty override. Only Reset deletes the key.
- `crates/scripts/src/config/effective.rs`: retain a blank prompt's sourced slot for Settings/serialization, but keep `Prompts::get(blank)` returning None for action consumers. No new IPC, API, dependency, persistence mechanism or backend domain.
- Existing Git Reset, Preview, search reveal, remembered repository and normal prompt builders are unchanged.

## Retained real-app evidence

The retained REA assets distinguish normal writes from Reset. `yzi` trims and calls repository-local `setValue`; `Hx → HN.updateSetting → JM` preserves blank prompt strings (`NLe` is true for the `Me`/`Z5` schemas), and `hN` writes that explicit value. Separately `yzi → _Ze → xzi/vho → Al/mho` exposes Setting actions/Reset when the repository-local configuration supplies `resetToInherited`. That calls normal `HN.deleteSetting`; `JM(deleteValue:true) → OE/tZ` removes the local key. `sg/wz/Lx/Nx` preserve the empty string and source in the effective-result path; `xzi` badges every defined value, including empty, as Customized.

`reference.json` retains **41 complete declarations/import/export bindings**, whole asset identities, UTF-8 half-open ranges and individual hashes:
- Renderer: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Original JavaScript is inert data, never evaluated. No new acquisition or REA gap occurred.

## Frozen RED → GREEN — Reason Cloud

```bash
node --test --test-concurrency=1 src/settings/actionResetOverride.test.ts
```

**Before:** 16 collected, **2 pass / 14 intended assertion failures**, reproduced again immediately before treatment; zero skipped/cancelled and no setup errors. Six missing-Reset cases, six blank-write cases, one explicit-empty Reset case and one pure model case fail. Assertions after each failure are not baseline-proven.

**After:** the byte-identical frozen 16-case prefix **16/16 PASS**. Fixture SHA-256 `4ea16788681cd57c7b06a680e09260e5d00fe2878c4b76257c839e100ee9a1a1`; immutable original in `frozen/`. Three appended controls cover unsaved-draft Reset supersession, inherited blank metadata and loading. The original fixture/helpers and assertions are unchanged.

The mounted fixture executes actual PromptRows, repoSettings.ts/useRepoSettings.ts, PendingEdit and WriteBarrier. IPC is synthetic memory with explicit command/key allowlists; Base UI/Dialog/Markdown are host ports. This proves emitted writes/state, not physical UI or Tauri/disk transport.

The older rowModel test's incorrect blank→null assertion was archived completely, then explicitly corrected to blank→empty based on the closed reference path. Its other expectations remain byte-identical. The older Preview harness adds exactly two import host ports (Base UI/Ellipsis); all seven frozen bodies/assertions remain byte-identical.

## Adjacent checks — passed

```bash
node --test --test-concurrency=1 \
  src/settings/actionResetOverride.test.ts \
  src/settings/actionPromptPreview.test.ts \
  src/settings/rows/rowModel.test.ts \
  src/settings/rows/repoGitDeleteReset.test.ts \
  src/settings/prompts.test.ts \
  evidence/settings/action-preview/mounted.cjs \
  src/settings/settingsSearchActivation.test.ts \
  src/settings/settingsSearchReveal.test.ts \
  src/settings/configSyncPendingSelection.test.ts \
  src/features/diff/review.test.ts \
  src/features/pr/checks/fixErrors.test.ts
```

**91/91 PASS**, zero skipped/cancelled. Complete raw TAP is retained compressed as `adjacent-expanded.tap.gz`; the initial narrower **54/54 PASS** receipt is `adjacent.tap.gz`.

```bash
python3 evidence/settings/action-reset-override/verify.py
npm run lint:colors
rustfmt --edition 2021 --check crates/scripts/src/config/effective.rs crates/scripts/src/config/effective_tests.rs
git diff --check
```

Source/freeze/scope verification, six color tests/full scan, formatting and whitespace checks **PASS**. The verifier retains whole original and span hashes, frozen RED and GREEN controls, the sole explicit legacy expectation correction, Preview assertion identity, unchanged adjacent owners and real-Rust source identities.

## Real Rust resolver proof, separately labelled

The admitted ordinary command

```bash
cargo test --offline --manifest-path crates/scripts/Cargo.toml -j1 config::effective_tests:: -- --test-threads=1
```

**Failed before compilation** (exit 101): cached `tempfile` unavailable. No dependency fetch or full/Tauri build was attempted. The ordinary crate-test harness is **NOT_RUN**, not passed.

The dependency-equivalent bounded substitute passed:

```bash
python3 evidence/settings/action-reset-override/run_resolver_probe.py
# internally: cargo run --offline -j1 --quiet --manifest-path <generated probe>/Cargo.toml
```

It compiles the actual config module and all **20 unchanged effective-test function/helper/assertion bodies** against the frozen resolver and current resolver. Only `#[test]` registration is removed so exact test functions can be called from a binary. A standard-library RAII temporary-directory host substitutes for the absent tempfile crate; directories and test settings are synthetic and removed on Drop. Production resolver, TOML writer/parser, serializer and config dependencies are real, unchanged source, not stubs.

- Frozen resolver: **18 pass / 2 intended metadata assertion failures**.
- Treatment resolver: **20/20 PASS**, covering all six prompt kinds; explicit empty and whitespace local writes; sourced/serialized metadata; get(blank) None; Reset removing only the local key and restoring inheritance; unrelated scripts preserved; managed blank precedence; plus all 18 prior effective-settings cases.
- `resolver-probe-identities.json` pins every real config source, original resolver, exact test file and generated probe. `rust-resolver-probe.log` retains complete paired output.
- One serialized offline job, no fetch; own compiler/probe processes **[]** after completion and explicit slot release sent to ledger. No additional local frontend build pipeline.

## Direct slot-consumer audit

Blank slots now survive serialization. Existing actual direct consumers are safe without changes: Claude/Reason first-message helpers call `withGeneralPreferences`/`withRenameBranch`, which ignore trim-empty instructions; ReviewButton passes its value to `buildReviewPrompt`, which trims/ignores it; the Rust Create PR command passes it to `create_pr_prompt`, whose `present` filters trim-empty. Ordinary Rust getter consumers still receive None. Pure-builder controls are included in the adjacent set; normal builders/wrappers remain byte-identical. Organization prompt settings are a separate, excluded model/UI.

## Delivery and acceptance limits

Ready PR targets **main**, not another PR branch. Every exact-head workflow/check must settle successfully before merge; conditional skips are not test passes. CI-to-actual-squash ownership remains with SAME49.

**No screenshot/recording:** this lane has no browser/native/runtime admission; sole existing runtime/release owners retain it. Physical menu positioning, hover/focus/blur/keyboard, Tauri transport, native user-file persistence and packaged/installed inclusion remain **UNVERIFIED**. Synthetic Rust filesystem writes do not prove native persistence transport. There is no provider/action/browser/native/package dispatch here.

Consuming-release custody must first prove packaged/embedded inclusion of the eventual actual squash, then test all six local Actions rows: Reset restores inherited/default state, clearing saves a resettable empty override, absent/inherited rows lack local Reset, the pending draft cannot recreate a deleted override, and existing Preview/reveal/remembered-repository controls still hold. Existing sole release custody is unchanged.

[Evidence page](https://reasonmachines.com/agents/49e3976d-9553-42d8-8101-2504177fbb97?page=168ca2f9-24b7-45b1-9f97-409c09a7fe4a).
