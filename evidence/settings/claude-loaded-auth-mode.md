# Loaded global Claude authentication mode

Conductor Rebuild checked current main at `a588bddd7f56be4493644dae4c41952919e56f6a` on 2026-11-11. This change fixes the UI's pure provider resolution for an already-loaded global settings value. It does not change provider configuration, authentication, persistence, or agent execution.

## Counterexample

The valid in-memory input is `DEFAULT_SETTINGS` with `claude_provider: "custom"` and `providers: {}`. No pending card action exists.

Before the fix, `providerOf(settings, "claude")` returns `null`. `ClaudeTab` passes that result to `authModeOf`, so its settled `mode` is `"cli"`. The same `mode` selects the authentication card and chooses the login button instead of the API key field. This does not depend on a save, reload, secret, or external provider response.

The path from loaded input to the card is present in current source:

- `useSettings` publishes the result of `getSettings` without rewriting the provider map.
- `SettingsView` passes the settings to `AgentsPage` for the providers page.
- The Claude tab passes those settings unchanged to `ClaudeTab`.
- `ClaudeTab` derives `stored`, `storedMode`, and `mode`, then supplies `mode` to `AuthCards`.
- `AuthCards` derives each button's `aria-pressed` from that value.

The local Rust resolver `Settings::provider_for` gives an explicit provider-map entry precedence, then resolves a trimmed global `claude_provider = "custom"` to `AnthropicApi::default()`. `AnthropicAuth::default()` is `ApiKey`. The UI had omitted this fallback.

## Retained REA source

The evidence is retained shipped-source text, not a new acquisition or a runtime observation.

The source archive is `conductor-dxe-source-closure.tar`, attachment `078ccf87-1bdc-43a9-b085-ea94babc5839`, SHA-256 `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`.

- `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The retained Dxe packet contains the complete `dxe` declaration at renderer UTF-8 bytes `[10618330,10618506)` and complete `jpa` declaration at `[10619879,10624045)`. With omitted `repoContext`, `dxe` returns user query data. `jpa` reads `claude_provider` into `u`, derives `x = u === "custom"`, and selects `K = z ?? (x ? "apikey" : "cli")`. A settled `z = null` therefore selects the API key mode for a loaded global custom value.

The existing `same64-jpa-mount-source-v1.json` packet closes the explicit-local user route through the providers panel to `jpa` with undefined `repoContext`. Its SHA-256 is `885b5c3581fb93159d49df0bbe1733e9051e46d3d52d507933d1cc2133f693b4`. Recipient verification passed all 19 spans and eight bounded symbol queries against the original archive. The two original asset hashes and the reused Dxe/Jpa spans also matched. No reference JavaScript was executed.

## Fix and controls

`providerOf` keeps an explicit provider-map object unchanged. Only when the Claude map entry is absent does a trimmed global custom value resolve to the existing Anthropic API-key configuration. Codex resolution is unchanged. No new helper or configuration format is introduced.

The tests cover the loaded custom input, the API-key name and disconnected message, explicit login and API-token object identity, default and empty values, whitespace trimming, unchanged input settings, and unchanged Codex behavior.

## Verification

Run on Reason Cloud computer 298:

```bash
node --experimental-strip-types --test src/settings/agents/agents.test.ts
```

- Before the production fix, the same regression tests failed twice and passed eight times. Both failures selected CLI instead of API key for the custom global value, with and without surrounding whitespace.
- After the production fix, all ten unchanged tests passed.

```bash
node --experimental-strip-types --test src/settings/agents/agents.test.ts src/settings/agents/agentStatusLoader.test.ts src/settings/agentOptions.test.ts
```

All 17 tests passed. `git diff --check` passed.

A broader local attempt also included `agentSettings.test.ts` and `providerTab.test.ts`. It passed 17 tests but could not load those two files because this dependency-free checkout lacks `@tauri-apps/api` and `react`. No install or substitute loader was used. Full type checking, frontend build, and the dependency-installed suite are left to hosted CI.

## Limits

This is a pure-helper regression with a statically reachable UI consumer. It is not a mounted React, browser, native, or visual test. No screenshot is provided because those execution paths are outside this lane's admission. Installed-app behavior, restart persistence, cross-window behavior, provider authentication, and side-by-side parity remain unverified. The save/IPC/readback source investigation remains a separate owner.
