# Reason CLI: what Settings › Agents › Reason uses

Read on 2026-11-06 from the real CLI: `reason` 0.2.692 on Sven's Mac
("sven m5 max", signed in) and 0.2.673 on a Reason cloud computer (never
signed in). Conductor has no Reason tab; the layout follows its Claude Code
and Codex tabs (see the shared kit in `src/settings/agents/kit.tsx`).

## Authentication

- `reason acp --help` (both versions): "Sign in with `reason login` (an
  editor with terminal sign-in runs it for you), or set REASON_API_KEY."
  So the API key card works with the CLI as it is: the key reaches `reason`
  as `REASON_API_KEY` (`agent::reason::ReasonApi`). No CLI gap for the key.
- `reason connect --help` lists `--api-key KEY` (devices:write), so a key
  without that scope can run chats but not connect this computer.
- `reason login` with no terminal (the app's case) prints and returns:

  ```text
  Open this link to sign in to Reason: https://reasonmachines.com/cli/connect?request=<uuid>
  The page shows the code XXXX-XXXX.
  It finishes on its own once you have; run `reason login` again any time to see where it stands.
  ```

  Running it again before the link is used prints "Not signed in yet." and
  the same link and code. That is the "Reason account" card's flow: show the
  code, open the link, poll `reason status --json` until an account appears.
- `reason login --pair CODE` takes a code *issued by Reason* (a "paired
  setup command"), not one the CLI prints, so the app uses plain
  `reason login`. 0.2.692 adds `--workspace SLUG|ID` and `--switch`.

## Status

`reason status --json` gives `version`, `account {name, email,
credential}`, `account_error`, `organization`, `workspaces [{id, slug, name,
selected}]` and `connection.workspaces [{organization_id, state, blocked}]`.
Signed out it is `account: null, workspaces: []`. `account.rs` reads it; a
workspace counts as connected on this computer when a connection entry with
its id is `connected` and not `blocked`.

## Gaps to raise with the Reason CLI

- No machine-readable `reason login` (`--json`): the app reads the link and
  code out of the English text above.
- `reason whoami` prints nothing machine-readable either; the tab uses
  `reason status --json` instead.
