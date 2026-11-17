# Codex signed-out Refresh status

Conductor Rebuild owns this caller-only change. The source baseline is main `6cce43869f29e65eaeebb59f7d70ecacde304930`. The unchanged production checkout at baseline execution was `a923c0809d`.

## Source contract

The retained real Conductor assets join `Fpa` to the `Aca` query, `Ica` refresh mutation, shared Codex account store and `t$i` status renderer. In CLI mode, `Fpa` forwards query loading or mutation pending without suppressing it based on provider configuration. With absent account information, `t$i` displays `Checking login status...`.

`Sca` publishes the result of `getCodexAuthInfo` only when its error is undefined. The declared no-account response omits both accountInfo and error. The store accepts undefined, so a successful signed-out response leaves no selected account. A later pending Refresh reaches the checking branch. An existing account or an error retaining that account has different semantics and is not this defect.

The original archive, both shipped asset hashes and all 26 literal spans were verified before editing. [source.json](source.json) records the complete query, mutation, publication, schema and import/export joins. It also records the current-main caller, hook, loader and shared renderer hashes. The inherited REA semantic renderer analysis exhausted heap. This packet verifies literal extraction from the retained original app bytes without executing reference JavaScript.

To recheck the source, run `python3 evidence/settings/codex-signed-out-refresh/verify_source.py --archive <original-conductor-dxe-source-closure.tar>`.

## Mounted regression

The test mounts the production CodexTab in CLI mode and retains the real useAgentStatus, agentStatusLoader, auth adapters, StatusLine and AuthStatus. It settles an initial signed-out response, then clicks the actual Refresh button without remounting. Deferred transport responses are inert. Native IPC, provider mutation, PTY actions, credential reads and external opening throw if called.

The two target assertions require checking text while both second-round responses remain pending, or while only CLI status remains pending. Three controls cover initial loading, settled signed-out state with enabled Refresh, and authenticated refresh preserving Connected. ChatGPT and API-key modes are outside the source contract. Their existing checking expressions remain unchanged.

The focused command is:

```bash
ONBOARDING_DOM_DEPS=.ara-state/codex-refresh-dom-deps node --test --test-reporter=tap tests/chat-search/codexSignedOutRefresh.dom.test.mjs
```

The test uses the existing dependency convention. App dependencies were installed with `npm ci --ignore-scripts --no-audit --no-fund`. The isolated DOM dependency was installed with `npm install --prefix .ara-state/codex-refresh-dom-deps --cache .ara-state/npm-cache --ignore-scripts --no-audit --no-fund --package-lock=false --save-exact jsdom@26.1.0`. Node was v22.23.4.

## Baseline

[baseline.tap](baseline.tap) records two intended assertion failures and three passing controls. Both failures occur at `A retained provider record must not hide the signed-out checking state`. The actual text remains `CLI not authenticated` while Refresh is disabled. This is a text assertion failure, not a setup or compiler error.

[fixture.sha256](fixture.sha256) freezes the regression before the product correction. Baseline commit `ef3db7bd48` retains the unchanged caller and failing test.

The correction changes only the checking expression in CodexTab. CLI mode forwards loading even with a retained provider record. ChatGPT still uses `reading && !account`, and API-key mode still uses `loading && !provider`. Shared auth and status rules are unchanged.

The identical focused command then passed all five cases. [candidate.tap](candidate.tap) retains the complete result. Fixture identity, original-byte source verification, and syntax checks passed. Local `npm run typecheck` did not finish before the 180-second command timeout on the busy shared computer, so it is unverified locally. The ordinary PR check remains responsible for typecheck and build.

Main `1c8e9593099bce8ebfbc19d83052cbfd47df5ad0` was fetched before publication. All eight caller, hook, loader and auth files pinned in source.json remain byte-identical there.

## Verification limits

Only the focused provider-free Node and JSDOM regression ran on Reason Cloud. No app, browser, reference JavaScript, native executor, installed app, real provider, real login or real IPC was run. No credentials were accessed. There is no screenshot because visible app execution is outside this unit. Simulated DOM results do not establish native behavior.

The automatic cheap PR workflow does not run the DOM suite after #1144. The regression remains in the existing manual frontend-unit DOM glob, without changing CI or its triggers. No hosted workflow was dispatched. Packaging stays with the existing release owner.
