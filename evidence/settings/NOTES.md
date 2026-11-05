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
On the Rust side, `evidence/ipc/ipc-rust-bindings.json` (#93) binds `set_keychain_setting`
to `conductor_lib::keychain_settings::set_keychain_setting` (fn at `0x1007ddd84`). All three
command strings are referenced from closures in `conductor_lib::run`, which is the handler
registration. `get_` and `delete_` have no local handler symbol, so they were probably inlined
into a `keychain_settings` module. The service and account strings are not yet bound.

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

## Settings pages

Source: `evidence/settings/settings-registry.json`, pulled on 2026-11-05 from Conductor's
frontend bundle (`renderApp-D_fmY7hW.js`, sha256 in the file) inside the REA-extracted Tauri
assets on `sven m5 max`. Conductor registers every settings row in one registry with `tab`,
`settingKey`, `scopes`, `title` and `description`; the file lists the rows a regex over those
registrations found.

- Navigation (`jWt` in the bundle): Personal = General, Account, Appearance, Default models
  (`models`), Git, Ports; Agents & environment = Agents (`providers`), Environment;
  Repositories = Scripts, Actions, Misc; More = Experimental, Advanced.
- So the "Agents" page is the `providers` route, and Theme lives on Appearance, not General.
  Our General page carries Theme until an Appearance page exists (divergence).
- Git, user scope: Git identity (cloud only), Open pull requests in (GitHub, Linear,
  Graphite), Branch name prefix, Rename workspace when branch is named, Delete branch on
  archive, Archive on merge, Automerge, Treat optional checks as blocking, Set upstream on
  plain git push, Use GitHub stacked PRs.
- Branch name prefix: radios "GitHub username" (with ` (<login>)` when known), "Custom" and
  "None". Custom shows an input with placeholder `e.g. feature/ or myname-`, saves on blur
  and shows `Preview: <prefix>tokyo`.

OpenConductor's Git page shows only Branch name prefix, the one Git row whose setting our
code reads (`src/workspace/naming.ts`). Divergences: Conductor joins the custom prefix to the
name as a raw string (`myname-tokyo`); our naming slugifies each `/` part and joins with `/`,
so a trailing `/` is dropped on save and the preview comes from our real resolver.

## REA gaps hit (settings pages)

- `rea trace-javascript-semantics` with a literal seed `"Branch name prefix"` (a UI string in
  a settings-row registration) exited 0 in 33 s with `status: partial`, 0 seed nodes, 0 nodes
  and the same 935 unknowns as the keychain traces. So literal seeds miss plain UI strings
  too, not only Tauri `invoke` names; REA could not place the row in its module. The registry
  above was read from the shipped bundle instead.
- REA has no extractor for app-defined registries such as this settings-row table; the copy
  catalog gives the strings alphabetically with no page, key or scope.
