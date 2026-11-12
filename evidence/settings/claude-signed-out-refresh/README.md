# Claude signed-out Refresh status

Conductor Rebuild owns this caller-only change. The source baseline is main `fc5215e8b6e7fd5e12767155fdbb9d0bcc1e82f1`.

## Source contract

The retained real Conductor assets join `jpa` → `Cpa` → `t$i`. In CLI mode, a pending refresh shows “Checking login status...” when no authenticated account is selected. Cached provider configuration is not authenticated account information. `Mpa` and `Ppa` select the account, while `wPt`, `C7t`, and `Zhe` join the local query and refresh to the cached CLI status producer. The parser returns no selected status for `loggedIn:false`.

[source.json](source.json) keeps the exact asset offsets, literal bytes, hashes, inherited REA receipt, and source limits. The original semantic renderer analysis exhausted heap. The fallback verifies literal spans against the retained original upload without executing reference JavaScript. Both retained packet verifiers passed (17 display spans with 74 checks; 12 producer spans with 62 checks).

## Mounted regression

`tests/chat-search/claudeSignedOutRefresh.dom.test.mjs` retains the production `ClaudeTab`, `useAgentStatus`, `agentStatusLoader`, `agentAuth`, `StatusLine`, and `AuthStatus`. Only transport and unrelated UI boundaries are inert. It clicks the mounted Refresh button after settling the first request, without remounting the tab.

The two intended failures assert checking text while both second-round responses are pending, or while only CLI status remains pending. Three controls cover initial loading, settled signed-out state, and authenticated refresh retaining Connected. All cases forbid login, provider mutation, credential reads, and PTY actions.

The existing automatic frontend DOM step runs `ONBOARDING_DOM_DEPS=<CI dependency prefix> node --test tests/chat-search/*.dom.test.mjs`. The fixture hash is frozen in [fixture.sha256](fixture.sha256). No production hunk is allowed before an intended text assertion fails with the three controls passing. A harness or compiler failure does not qualify.

## Verification limits

Behavioral baseline is pending. No local app, native executor, installed macOS app, real provider, or real login was run. There is no screenshot because native and visible app execution are outside this unit. A hosted DOM result proves only mounted frontend behavior with inert status responses.
