# Custom terminal-dot delimiter

Conductor Rebuild owns DOT-PREFIX-DELIMITER-49-02. This directory currently records **source preparation only**. No new regression, dependency restore, Cargo operation, typecheck, native UI or provider operation has run.

## Source qualification

The sealed source-owner49 v3 archive matched its original SHA256 and all 43 manifest entries. At main `fdcb381d07c3252c3c3e20bc6af881a6d2d43a0a`, all 25 recorded source files were compared with the actual checkout. Twelve retained real-Conductor 0.87.6 REA spans matched their byte lengths and SHA256 pins. The only snapshot drift from the sealed packet is the delivered GeneralPage notification-denial feedback. DOT validation, input, naming and creation sources are unchanged.

[The preparation receipt](source-preparation.json) retains the source, asset, span and fixture pins. Retained excerpts live in [the parent reference directory](../reference/). This is not a fresh whole-asset extraction or native acceptance.

The retained row passes input through Joi and nIn, preserving a final single period. Its wAn/q$/A6t alias chain requests `branch_prefix_custom` storage. C2 reads that value and $Wt concatenates it with a branch leaf. This predicts `team.tokyo` **if native storage accepts `team.`**; native acceptance remains unknown.

At the checked main, both frontend `branchPrefixError` and Rust `valid_branch_prefix` reject `team.`. Naming already supports that delimiter. The UI also normalizes `team./` into `team.`; the fix must not accidentally make that invalid dot-ending path component acceptable.

## Frozen new regressions

- `src/settings/customPrefixDotDelimiter.test.ts` has ten planned cases. It runs the actual GitPage, controls, settings model, naming resolver and create-request builder. Username lookup and save are fake boundaries; Row is a layout-only test substitute. It checks one blur write for `team.`, `team.tokyo` preview/create, unchanged Enter deduplication, seven invalid-input controls, and GitHub/None modes. Expected baseline is two intended failures and eight passing controls, not an observed result yet.
- `backend/harness.rs` links the actual settings model, production validation, branch naming and necessary provider definitions. Three focused tests use in-memory synthetic Settings values. No provider, agent, native permission or file persistence operation is invoked. Expected baseline is one intended failure and two passing controls, not an observed result yet.
- The pre-existing seven-case pure fixture, six-case mounted fixture and Rust naming fixture keep their exact original bytes. This unit does not treat their historical passes as proof of the new behavior.

The new frontend fixture SHA256 is `8323215cfdfb705889d4f1e419c166652dfebe97e94421bab4340b535da2e5e9`. The Rust harness SHA256 is `92bcfae25ee96df34a6687b450e84b4690800b3b0eaa4104c645f9e1386579ef`. The backend manifest SHA256 is `e5ba2cba5878e85564af9f5c0ff97281528356747f26dacceed8ddc31d5c2253`.

## Execution requested, not admitted

All commands below require direct ACC serial admission on the actual current computer. Old notification grants and the earlier Cloud301 target are not reused.

Frontend, sequentially once:

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test --test-reporter=tap src/settings/customPrefixDotDelimiter.test.ts
# Apply only the scoped validation fix after the intended RED result.
node --test --test-reporter=tap src/settings/customPrefixDotDelimiter.test.ts
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

The assigned branch is retained and was synchronized by an ordinary merge of current main; no rebind, reset, extra checkout or new publisher was used. Declared cloud publication supports a successor when the earlier saved PR is merged, but provider publication of this successor has not been attempted. The eventual PR must be standalone and ready against main, never appended to notification PR #1160 or stacked.

Native Settings input, installed-app storage acceptance, actual workspace/Git creation, screenshots and side-by-side parity are **NOT_RUN**. No screenshot is supplied because native/browser/runtime admission is excluded. Original whole assets are unavailable here; the historical REA renderer semantic-analysis heap-exhaustion gap remains. Frozen Settings candidate `39c649c64a575dde189eeefa3e24b9ead6762336`, Mac app/PID, credentials, playground, Bergen and scratch remain untouched. This unit stays outside the existing release-owner992 cut and starts no package, dispatch or watch.
