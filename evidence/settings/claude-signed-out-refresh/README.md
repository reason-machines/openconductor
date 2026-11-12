# Claude signed-out Refresh status

Conductor Rebuild owns this caller-only change. The source baseline is main `fc5215e8b6e7fd5e12767155fdbb9d0bcc1e82f1`. Main `85ec32f94664d4bb46b0b70d45ff5355595517c9` was rechecked before the correction. Its ClaudeTab, shared status components, auth rules, and status loader still match the baseline.

## Source contract

The retained real Conductor assets join `jpa` → `Cpa` → `t$i`. In CLI mode, a pending refresh shows “Checking login status...” when no authenticated account is selected. Cached provider configuration is not authenticated account information. `Mpa` and `Ppa` select the account, while `wPt`, `C7t`, and `Zhe` join the local query and refresh to the cached CLI status producer. The parser returns no selected status for `loggedIn:false`.

[source.json](source.json) keeps the exact asset offsets, literal bytes, hashes, inherited REA receipt, and source limits. The original semantic renderer analysis exhausted heap. The fallback verifies literal spans against the retained original upload without executing reference JavaScript. Both retained packet verifiers passed (17 display spans with 74 checks; 12 producer spans with 62 checks).

## Mounted regression

`tests/chat-search/claudeSignedOutRefresh.dom.test.mjs` retains the production `ClaudeTab`, `useAgentStatus`, `agentStatusLoader`, `agentAuth`, `StatusLine`, and `AuthStatus`. Only transport and unrelated UI boundaries are inert. It clicks the mounted Refresh button after settling the first request, without remounting the tab.

The two intended failures assert checking text while both second-round responses are pending, or while only CLI status remains pending. Three controls cover initial loading, settled signed-out state, and authenticated refresh retaining Connected. All cases forbid login, provider mutation, credential reads, and PTY actions.

The existing automatic frontend DOM step runs `ONBOARDING_DOM_DEPS=<CI dependency prefix> node --test tests/chat-search/*.dom.test.mjs`. The fixture hash is frozen in [fixture.sha256](fixture.sha256). Its assertions are unchanged after the correction.

## Hosted baseline and correction

[Baseline job 131011321034](https://github.com/reason-machines/openconductor/actions/runs/43167076557/job/131011321034) ran head `933cca81e174fdb4975baa85fa202a7bb22ca524`. Both intended cases failed at the checking-text assertion, not during setup. The rendered text remained `CLI not authenticated` during the pending refresh. All three controls passed. The complete DOM suite reported 103 passed and 2 failed. [The five-case raw excerpt](baseline-hosted.log) retains the assertion errors and passing controls.

The correction removes only `!provider` from ClaudeTab's `checking` prop. A retained provider record does not establish authentication. The existing AuthStatus component already preserves Connected while `authenticated` is true, so shared status and auth rules need no change. Codex, login actions, provider mutation, and transport remain untouched.

Fresh static checks passed for the original upload hash, both shipped asset hashes, and all 17 literal spans in source.json. `sha256sum -c evidence/settings/claude-signed-out-refresh/fixture.sha256`, `node --check tests/chat-search/claudeSignedOutRefresh.dom.test.mjs`, and `git diff --check` passed. Hosted candidate verification is pending.

## Verification limits

No local app, native executor, installed macOS app, real provider, or real login was run. There is no screenshot because native and visible app execution are outside this unit. A hosted DOM result proves only mounted frontend behavior with inert status responses.
