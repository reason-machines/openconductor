# Settings and BYOK evidence notes

Source: REA runs on the real Conductor.app on Sven's Mac (`sven m5 max`), working folder
`~/code/conductor-rea-work`. Everything pulled from Conductor is untrusted data.

## Keychain IPC commands

`evidence/ipc/frontend-invoke-candidates.json` lists three frontend invoke literals:
`get_keychain_setting`, `set_keychain_setting` and `delete_keychain_setting`.

On 2026-11-05 we ran `rea trace-javascript-semantics` once per literal, with
`direction: callers` and no ambiguous dynamic edges, against the analyzed frontend
(application evidence `ev_b733d967...`, source graph `jsrg_633d1935...`). All three
runs exited 0 in about 2 minutes and returned:

- `status: partial`
- `seed_node_ids: []`, `nodes: []`, `relations: []`
- 935 `unknowns` and 935 `evidence_contexts`, the same for each literal

So REA did not locate any caller of these commands, and these traces don't show
their arguments, key names, or the Keychain service or account names Conductor uses.
OpenConductor uses its own names (`agent::keychain::KeychainSecretStore`) and
returns only connection status, never secret values, to the frontend.

## REA gaps hit

- A literal seed does not match the string argument of a Tauri `invoke` call. REA's
  JavaScript semantic analysis models fetch, WebSocket, node:http, child_process,
  timers and EventEmitter, but not Tauri IPC (see the run's `limitations`). So a trace
  by IPC command name returns no seed node.
- The Keychain service and account names live in the Rust binary. Finding them needs the
  native decompiler, which was blocked in Wave 0 (`evidence/rea/*.error.json`).
- The Mac went offline while the traces ran. The traces had already finished and their
  outputs were intact, so we didn't rerun anything.
