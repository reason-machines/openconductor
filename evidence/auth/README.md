# Real agent turns per auth mode (track A)

Real Claude Code and Codex CLIs, driven inside the built OpenConductor app
(debug bundle) on sven m5 max. Each mode sends one prompt in a new chat and
records the turn. These runs complement the CI tests with stand-in binaries
(`tools/e2e/claude-chat.e2e.mjs`, #650; `tools/e2e/codex-chat.e2e.mjs`, #633),
which prove the wiring. These runs prove that a real turn works.

Runs of 2026-11-11 (09:32 to 09:37Z) on an app built from main 3da28905,
Claude Code 2.1.322 and Codex 0.166.0. The first Claude run on 2026-11-11
stopped at "timed out waiting for the workspace view": the composer is now a
contenteditable editor, not a textarea, so the driver now types into it with
a normal insertText edit. The 2026-11-06 runs (main 95ec07d plus #668) gave
the same Codex and Claude API key results.

| Agent | Mode | Set in the app as | Result |
|---|---|---|---|
| Claude Code | Import (existing Claude login, nothing set) | nothing | **Blocked by provider**: the tab shows CLI, Connected and no `claude /login`; the turn reaches Anthropic, which answers "Claude Code can't use your Claude subscription, usually because a payment is past due · Pay or renew at https://claude.ai/settings/billing". The bare `claude -p` on the Mac's own login gets the same answer, so it is the account's billing state, not an app bug. (2026-11-06: "You've hit your weekly limit", which has since reset.) |
| Claude Code | Claude subscription login | CLI card (already the default with no setting, so nothing new is stored) | **Blocked by provider**: same billing answer |
| Claude Code | Anthropic API key | API key card, key typed and saved | **Pass**: reply `oc-apikey-ok`; key fingerprint `de95d2c8e13ef623` (1Password, Sven vault) |
| Codex | Import (existing ChatGPT login, nothing set) | nothing | **Pass**: reply `oc-import-ok` |
| Codex | ChatGPT subscription | ChatGPT card | **Pass**: reply `oc-chatgpt-ok` |
| Codex | OpenAI API key | API key card | **Pass**: reply `oc-apikey-ok`; key fingerprint `76e86bc2f5441fbf` (1Password, Production vault, `github-native-engineer-evals`, the evals project) |
| Codex | OpenAI API key, key-only control (no ChatGPT login in HOME) | API key card | **Pass** with this PR; **fail** before it (401 "Missing bearer or basic authentication") |

`blocked-by-provider` (tools/auth/summarize.py): the turn failed with the
provider's own usage or rate limit, or the provider's refusal of the
account's subscription for billing, while the tab showed Connected and no
sign-in prompt. A mode that fails any other way is `fail`. An agent's
`result` is `partial` when nothing failed but a mode was blocked or not run.

## The Codex API key bug this run found
The first Codex run with the evals key passed all three modes, but its HOME
also held the ChatGPT login, so the API key reply did not prove which
credential Codex used. The key-only control (`OC_E2E_KEY_ONLY=1`: no CLI
login in the throwaway HOME, only the API key mode) failed on main 95ec07d:
the tab showed Connected, and OpenAI answered 401 "Missing bearer or basic
authentication" ([codex-key-only-before-fix.json](codex-key-only-before-fix.json)).
Codex 0.166's app server does not read `CODEX_API_KEY` or `OPENAI_API_KEY`
from its environment, which was all the app passed. So on main, the API key
card silently used the ChatGPT login when one existed and failed when none did.

Conductor 0.87.6 (REA, `conductor-runtime.js` sha256 `f72df80a…`, bundle
offset 3,603,866) sets both variables and then, right after `initialized`,
sends `account/login/start {type: "apiKey", apiKey}`. That request makes
Codex write the key into `CODEX_HOME/auth.json`, replacing the user's
ChatGPT login (checked in a throwaway CODEX_HOME). This PR sends the same
request and adds `-c cli_auth_credentials_store="ephemeral"`, so the key
stays in the app server's memory. In a throwaway CODEX_HOME holding a ChatGPT
login, that launch reported an `apiKey` account, replied, and left
`auth.json` byte for byte unchanged. With the fix, the key-only control
passes ([codex-key-only.json](codex-key-only.json)).

Per-run detail, with fingerprints only: [claude.json](claude.json), [codex.json](codex.json), [codex-key-only.json](codex-key-only.json), [codex-key-only-before-fix.json](codex-key-only-before-fix.json).

## How a run proves which credential was used
- The app starts with a stale key in its environment: `ANTHROPIC_API_KEY`
  for Claude and `OPENAI_API_KEY` for Codex. A non-key mode only gets a real
  reply if the app clears that key and the CLI uses its own login.
- Claude API key: the subscription login is past its weekly limit, so the
  `oc-apikey-ok` reply can only come from the stored key.
- Codex API key: the key-only control has no ChatGPT login at all, so its
  reply can only come from the stored key.
- The subscription refusal is Anthropic's, not the app's. Plain
  `claude -p` outside the app gets the same message (see #650).

## Isolation
- Every run uses a throwaway HOME and data dir (`mktemp -d`, removed
  afterwards), never Sven's OpenConductor data.
- **Claude:** the throwaway HOME gets the account fields of `~/.claude.json`
  and a symlink to `~/Library/Keychains`. Claude Code keeps its login in the
  login Keychain, and the Keychain search list follows HOME. Nothing is
  copied out of the Keychain, and `~/.claude` is not touched.
- **Codex:** `~/.codex/auth.json` is copied with its refresh token blanked,
  so the copy can never rotate Sven's login out. After the run, the real
  file's `last_refresh` and refresh token were unchanged.
- **Keys saved in the app:** with `OC_E2E_OUT` set, the app keeps provider
  keys in memory (`agent::keychain::default_store`). The API key card
  therefore never writes to the login Keychain. After the run there was no
  `com.reasonmachines.openconductor` item for the key.
- **API keys:** keys are read with `op read` into the runner's environment
  only, then passed to the app as `OC_E2E_SECRET_<NAME>` by `export`, never
  on a command line. The driver types them into the key field through the
  debug-only `e2e_secret` command. The runner fails, and deletes the
  offending file, if a key value appears anywhere in its output.

## Reproduce (on a Mac with both CLIs signed in)
```bash
scripts/package-macos.sh
OC_E2E_ANTHROPIC_OP_REF="op://Sven/vugzge3y52itfkbudo2je62hrq/credential" \
  tools/claude-code/run-auth-modes-mac.sh /tmp/oc-auth/claude
OC_E2E_OPENAI_OP_REF="op://Production/github-native-engineer-evals/OPENAI_API_KEY" \
  tools/codex/run-auth-modes-mac.sh /tmp/oc-auth/codex
OC_E2E_KEY_ONLY=1 OC_E2E_OPENAI_OP_REF="op://Production/github-native-engineer-evals/OPENAI_API_KEY" \
  tools/codex/run-auth-modes-mac.sh /tmp/oc-auth/codex-key-only
```
Without an `OC_E2E_*_OP_REF`, the API key mode is reported "not run".
On a locked Mac whose display has slept, the window's timers stop and a run
stalls after "workspace created"; run it under `caffeinate -dimsu`.

## Not covered here
- VM / cloud-computer hand-off: built and tested in its own PR.
- A real Claude subscription turn: the weekly limit reset on Nov 11, but
  Anthropic now refuses the Mac's Claude Max login with "payment is past
  due". It needs the account's billing fixed; then rerun the Claude command
  above.
