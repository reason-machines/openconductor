# Custom terminal-dot delimiter

Conductor Rebuild owns DOT-PREFIX-DELIMITER-49-02. This directory currently records **source preparation only**. No new regression, dependency restore, Cargo operation, typecheck, native UI or provider operation has run.

## Source qualification

The sealed source-owner49 v3 archive matched its original SHA256 and all 43 manifest entries. The [original preparation receipt](source-preparation.json) records qualification at main `fdcb381d07c3252c3c3e20bc6af881a6d2d43a0a`.

The [version-two reconciliation receipt](reconciliation-v2.json) records a read-only fetch of main `6281fd5b157d5926ce4dab42dff3e21e4c9c2979`. All 25 source pins match the fdcb preparation and the current checkout. Twelve retained real-Conductor 0.87.6 REA spans match their byte lengths and SHA256 pins. The three legacy fixtures, model test, and package files are unchanged. This latest main was read, not merged into the assigned branch this turn. Containing main must be requalified again at direct ACC eligibility.

The actual GitPage on this checked main still uses `setCustom(e.target.value)`. The sanitizer is separately planned, not merged or exercised here. Retained excerpts live in [the parent reference directory](../reference/). This is not a fresh whole-asset extraction or native acceptance.

The retained row passes input through Joi and nIn, preserving a final single period. Its wAn/q$/A6t alias chain requests `branch_prefix_custom` storage. C2 reads that value and $Wt concatenates it with a branch leaf. This predicts `team.tokyo` **if native storage accepts `team.`**; native acceptance remains unknown.

At the checked main, both frontend `branchPrefixError` and Rust `valid_branch_prefix` reject `team.`. Naming already supports that delimiter. The UI also normalizes `team./` into `team.`; the fix must not accidentally make that invalid dot-ending path component acceptable.

## Versioned regressions

NEW10 remains byte-identical in [the preserved original fixture](original-new10/customPrefixDotDelimiter.test.ts.txt), with its original README and manifest. Its fixture SHA256 remains `8323215cfdfb705889d4f1e419c166652dfebe97e94421bab4340b535da2e5e9`. The original six-file packet is also retained as attachment `8b7decc6-c8f8-4eb0-af7a-2ec8948419ed`, SHA256 `7d26f874da43b677f434acde0b8c87ccf86111142e51f0cad7bd5b60d7ab9f00`. Its ten cases never ran. The original manifest records historical paths, not the active candidate paths.

NEW10 coupled raw validation rejection to raw input preservation after onChange. The separate sanitizer intentionally transforms `.team`, `team..`, `team space`, and `team@{branch` into `team`, `team.`, `teamspace`, and `teambranch`. After the DOT fix, those outputs are valid. Mounted raw-input rejection would therefore contradict the combined behavior. This is a source-based prediction, not an observed failure.

- `src/settings/customPrefixDotDelimiterV2.test.ts` is the separate NEW13 candidate. The two delimiter-positive cases and GitHub/None case retain their original assertions. All seven pairs of raw `branchPrefixError(input)` and `branchPrefixError(normalizeCustomPrefix(input))` guards remain in independent pure tests. Three independent mounted controls retain every original assertion for sanitizer-stable empty, `team.lock`, and `team./` inputs, adding exact field-value checks. No validator safeguard is removed. [The assertion mapping](reconciliation-v2.json) identifies every original case and the four mounted raw-preservation expectations that change with sanitization.
- NEW13 runs the actual GitPage, controls, settings model, naming resolver, and create-request builder. Username lookup and save are fake boundaries; Row is a layout-only substitute. Expected baseline is **two intended failures and eleven passing controls**, not an observed result. Expected identical-fixture GREEN is thirteen passes.
- `backend/harness.rs` is unchanged. It links actual settings model, production validation, branch naming, and necessary provider definitions. Three focused tests use in-memory synthetic Settings values. No provider, agent, native permission, or file persistence operation is invoked. Expected baseline is one intended failure and two passing controls, not an observed result.
- The pre-existing seven-case pure fixture, six-case mounted fixture, and Rust naming fixture keep their exact original bytes. Their historical passes do not prove the new behavior.

NEW13 SHA256 is `8c6bbd962eb12b2fd45f5d525003d61b17c87d9683db5f2258ad7600b02c046e`. The unchanged Rust harness SHA256 is `92bcfae25ee96df34a6687b450e84b4690800b3b0eaa4104c645f9e1386579ef`. The backend manifest SHA256 is `e5ba2cba5878e85564af9f5c0ff97281528356747f26dacceed8ddc31d5c2253`.

## Execution requested, not admitted

All commands below require direct ACC serial admission on the actual current computer. Old notification grants and the earlier Cloud301 target are not reused.

Frontend, sequentially once:

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test --test-reporter=tap src/settings/customPrefixDotDelimiterV2.test.ts
# Apply only the scoped validation fix after the intended RED result.
node --test --test-reporter=tap src/settings/customPrefixDotDelimiterV2.test.ts
node --test src/settings/customPrefix.test.ts src/settings/customPrefixInput.test.ts src/settings/model.test.ts
npm run typecheck
```

Requested bound is 120 seconds per command, with no parallel run or retry after timeout, resource warning or unexpected failure. The existing model test that rejects `a.` requires a focused expectation update once the new regression is RED. No original seven/six-case fixture is changed.

The Rust request is separate and not an app build or dispatch:

```bash
cargo generate-lockfile --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend/Cargo.toml
cargo fetch --locked --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend/Cargo.toml
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=e2e-artifacts/dot-prefix-c18/rust-target cargo test --locked --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend/Cargo.toml dot_prefix_ -- --nocapture
# Apply the same scoped Rust validation fix only after intended RED.
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=e2e-artifacts/dot-prefix-c18/rust-target cargo test --locked --manifest-path evidence/settings/custom-prefix/dot-delimiter/backend/Cargo.toml dot_prefix_ -- --nocapture
```

Requested bounds are 60 seconds for lock generation, 120 for one locked fetch, and 120 per focused test pass. No Cargo command has run; the lockfile does not exist yet. No application/native build or release workflow is requested.

## Scope and remaining gaps

Product code is unchanged. Proposed work is the final-single-dot boundary in `src/settings/model.ts` and Rust settings validation, including coherent rejection of `team./`. The separate sanitizer owner keeps GitPage's helper/onChange hunks; this unit makes no sanitizer, live-write timing, caret or IME change.

The assigned branch is retained at `b183ded`, after its earlier ordinary merge of main `fdcb381`. Latest main `6281fd5b` was only fetched and source-qualified this turn. No rebind, reset, extra checkout, or new publisher was used. Declared cloud publication supports a successor when the earlier saved PR is merged, but provider publication of this successor has not been attempted. The eventual PR must be standalone and ready against main, never appended to notification PR #1160 or stacked.

Native Settings input, installed-app storage acceptance, actual workspace/Git creation, screenshots and side-by-side parity are **NOT_RUN**. No screenshot is supplied because native/browser/runtime admission is excluded. Original whole assets are unavailable here; the historical REA renderer semantic-analysis heap-exhaustion gap remains. Frozen Settings candidate `39c649c64a575dde189eeefa3e24b9ead6762336`, Mac app/PID, credentials, playground, Bergen and scratch remain untouched. This unit stays outside the existing release-owner992 cut and starts no package, dispatch or watch.
