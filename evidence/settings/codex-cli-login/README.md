# Keep the local Codex login action visible

Conductor Rebuild owns this regression and delivery.

## Source evidence

Main `ca2e1d7b9cf51a0e4bcde8d0e0d62875c0c10efb` hides `LoginButton` when CLI status reports authenticated. The shipped Conductor renderer's `Fpa` function selects the ChatGPT, API-key, or `Met` action by mode `pe`. Its connected flag `ke` controls the separate status component, not that action choice. `Met` renders its idle `Run codex login` action without reading authentication status.

[Reference source and REA lineage](reference-source.json) preserves the exact `Fpa` and `Met` literals, offsets, and hashes. [Original-byte verification](reference-revalidation.json) matches both literals to the uploaded shipped renderer and confirms the frozen baseline equals current main. The earlier REA semantic renderer analysis exhausted heap. This is source evidence, not a native UI observation. No reference JavaScript was executed or fresh Mac acquisition made.

The fix removes only `!auth.authenticated` from the CLI action conditional. It preserves the CLI mode requirement, ChatGPT and API-key branches, status, credentials, and provider commands. Claude and Codex remain local-only. Nothing transfers credentials to cloud.

## Frozen regression

The fixture mounts the actual `CodexTab`, `LoginButton`, and `AuthStatus` with React's test renderer. Actual mode and authentication rules consume simulated status. Layout leaves and the status hook are substituted. Native, terminal, and credential operations throw if reached. The fixture does not click login.

The five-case fixture SHA-256 is `15a7fef650efa2f5b85859ef067193b6fc4eefdbb72e933ecaeb72e1e0d15191`. Preserve its bytes between baseline and candidate runs.

```bash
node --test src/settings/agents/codexLoginVisibility.test.ts
```

The baseline must complete all five cases, with exactly two missing-button assertion failures and three passing controls. Only `connected CLI retains Run codex login` and `refreshing connected CLI retains Run codex login` may fail. Signed-out CLI, API-key, and ChatGPT controls must pass. Import, setup, and type errors do not qualify as behavioral RED.

The test-first head `17cf1582975951893e253510f06f05b3f3f8f932` left product code unchanged. [Hosted unit job 130648150442](https://github.com/reason-machines/openconductor/actions/runs/43056758274/job/130648150442) completed all five cases with exactly the two expected missing-button failures and three passing controls. The full suite completed 2,860 tests with only those two failures. Typecheck passed in the separate build job before its duplicated unit step failed.

[Baseline log](hosted-red.tap.txt) and [machine-readable receipt](hosted-red.json) retain the observed result. This is behavioral RED, separate from the source hashes. Candidate GREEN remains pending.

The retained baseline supports a paired replay without changing the fixture:

```bash
CODEX_LOGIN_SOURCE_FILE=evidence/settings/codex-cli-login/baseline-CodexTab.tsx.txt \
  node --test src/settings/agents/codexLoginVisibility.test.ts
```

The proof test verifies the frozen fixture hash, replays all five cases against the retained baseline, and then requires all five to pass against the candidate. It rejects setup errors, cancellations, skips, missing TAP summaries, and unexpected failures. It runs through the existing automatic frontend checks without workflow changes.

```bash
node --test src/settings/agents/codexLoginVisibilityProof.test.ts
```

## Verification boundary

- Original archive identity, renderer identity, both source slices, frozen fixture identity, and baseline equality with main passed static checks.
- `git apply --check` passed for the prepared one-line fix and evidence packet. The staged whitespace check reports the retained baseline's extra blank line at EOF. That snapshot intentionally preserves main's exact bytes; the other added files pass the whitespace check.
- Hosted behavioral RED passed qualification. Candidate GREEN and paired replay are pending. No local Node, browser, Rust, native, provider, terminal, or IPC execution was performed. Ordinary hosted CI is the execution route for this regression.
- No screenshot is available because browser and native execution are outside this lane's admitted runtime scope.
- Mounted tests cannot prove native appearance, terminal spawn, real account switching, real IPC, or side-by-side parity.
- Exact-head CI, merge, and consuming-main macOS package verification remain pending for this separate main-based PR. The preceding Claude fix merged in #1042. Its consuming-main package is followed separately.
