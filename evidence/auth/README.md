# Real agent turns per auth mode (track A)

Real Claude Code and Codex CLIs, driven inside the built OpenConductor app
(debug bundle) on sven m5 max. Each mode sends one prompt in a new chat and
records the turn. These runs complement the CI tests with stand-in binaries
(`tools/e2e/claude-chat.e2e.mjs`, #650; `tools/e2e/codex-chat.e2e.mjs`, #633),
which prove the wiring. These runs prove that a real turn works.

| Agent | Mode | Set in the app as | Result |
|---|---|---|---|
| Claude Code 2.1.319 | Import (existing Claude login, nothing set) | nothing | **Blocked**: the tab shows CLI, Connected and no `claude /login`; the turn reaches Anthropic, which answers "You've hit your weekly limit · resets Nov 11 at 1am (America/Los_Angeles)" |
| Claude Code 2.1.319 | Claude subscription login | CLI card (already the default with no setting, so nothing new is stored) | **Blocked**: same weekly-limit answer |
| Claude Code 2.1.319 | Anthropic API key | API key card, key typed and saved | **Pass**: reply `oc-apikey-ok`; key fingerprint `de95d2c8e13ef623` |
| Codex 0.166.0 | Import (existing ChatGPT login, nothing set) | nothing | **Pass**: reply `oc-import-ok` |
| Codex 0.166.0 | ChatGPT subscription | ChatGPT card | **Pass**: reply `oc-chatgpt-ok` |
| Codex 0.166.0 | OpenAI API key | API key card | **Not run**: Sven's 1Password vault has no usable OpenAI key. Its only one is in "Leaked legacy keys pending owner revocation" and stays unused. Keys from other vaults are not substituted. |

Per-run detail, with fingerprints only: [claude.json](claude.json), [codex.json](codex.json).

## How a run proves which credential was used
- The app starts with a stale key in its environment: `ANTHROPIC_API_KEY`
  for Claude and `OPENAI_API_KEY` for Codex. A non-key mode only gets a real
  reply if the app clears that key and the CLI uses its own login.
- Claude API key: the subscription login is past its weekly limit, so the
  `oc-apikey-ok` reply can only come from the stored key.
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
OC_E2E_OPENAI_OP_REF="op://<vault>/<item>/credential" \
  tools/codex/run-auth-modes-mac.sh /tmp/oc-auth/codex
```
Without an `OC_E2E_*_OP_REF`, the API key mode is reported "not run".

## Not covered here
- VM / cloud-computer hand-off: built and tested in its own PR.
- A real Claude subscription turn: blocked until the weekly limit resets
  (Nov 11, 1am PT). A recheck is scheduled for Nov 11 at 09:30Z.
