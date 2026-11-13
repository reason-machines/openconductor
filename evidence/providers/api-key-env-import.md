# API key import from the environment (Agents page)

Conductor Rebuild read this on 2026-11-11 from retained shipped bytes only; no
reference JavaScript was executed and nothing was acquired, installed or run on
a Mac. Current main checked: `b6e7473d`.

Source archive: `conductor-dxe-source-closure.tar` (attachment
`078ccf87-1bdc-43a9-b085-ea94babc5839`, SHA-256 `f3ef2620…6084`), containing
`renderApp-D_fmY7hW.js` (11,600,457 B, SHA-256 `5199d392…5dde`) and
`index-BGEQ8YjU.js` (3,493,297 B, SHA-256 `b5b01f33…dbf3`).

## What the reference does

When the user picks the **API key** card, Conductor asks the backend for a key
already present in the environment and, if one comes back, stores it and shows
the toast "API key imported from env".

| Symbol | Renderer UTF-8 bytes | SHA-256 of span | Role |
|---|---|---|---|
| `jpa` (Claude tab) | `[10619879,10624045)` | `f339bdf9702ca236ab96391682eeccb54f05f999690c91e2717e43f25d01535f` | on `apikey`: set `claude_provider=custom`, then `f$i()`; if non-blank, save `ANTHROPIC_API_KEY` as a shared local env var, invalidate, toast at `[10620966,10621005)` |
| `Fpa` (Codex tab) | `[10624045,10629892)` | `91cfc778aef5e775a9fc3b2a1a60a2670a830f4de0bd4399e512e94a92c528ac` | on `apikey`: `d$i()` first; if non-blank, save `CODEX_API_KEY`, then `codex_provider=custom`, toast at `[10625458,10625497)`; otherwise only `codex_provider=custom` |
| `d$i` | `[10278276,10278352)` | `3ee4e930db202030069dfd39745b83d3283630a11cd1b307b6114384844fee3d` | `invoke("get_openai_api_key_from_env")` |
| `f$i` | `[10278352,10278431)` | `1bd76a8cd03cd05ae827858e2645a0a538f42af2668702090c717a50a78843b6` | `invoke("get_anthropic_api_key_from_env")` |
| `Rca` | `[10278518,10279114)` | `58ea76de0af8daf351e092b2a7ad40199998d08375503d2b2caee68f540308ea` | builds `localAgentApiKeys`: a stored shared env var wins, the env lookup is the fallback (`sae`, first non-blank) |

The `jpa` span is byte-identical to the one in the Dxe packet
(`evidence/settings/claude-loaded-auth-mode.md`).

## OpenConductor today

`ClaudeTab.switchMode` and `CodexTab` only write the provider config; neither
reads a key from the environment. With `ANTHROPIC_API_KEY` exported, picking
API key shows "No Anthropic API key configured" and an empty field, where
Conductor would import the key and show the toast.

## Why this is not built yet (finite evidence gap)

- Both backend handlers (`get_openai_api_key_from_env`,
  `get_anthropic_api_key_from_env`) live in the Rust binary. Neither name appears in
  the index bundle or in `evidence/ipc/`. Which environment they read (the app process
  or the captured login shell; the login-shell capture strips these keys, see
  `README.md`) and which variable names they accept (only `OPENAI_API_KEY`, or
  `CODEX_API_KEY` too) are therefore unknown. A GUI-launched app's process
  environment usually holds neither key, so this choice decides whether the feature
  ever triggers.
- Conductor stores the imported key as a shared local environment variable
  (Environment page); OpenConductor keeps keys in the Keychain. Mapping one
  onto the other is a design decision, not evidence.
- Closing it needs a Ghidra/REA binding of those two handlers, which is blocked by
  the same REA gap as the `*_keychain_setting` handlers (`README.md`, Gaps).
