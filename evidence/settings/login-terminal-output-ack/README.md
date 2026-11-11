# Login terminal output acknowledgements

Conductor Rebuild re-read main `15e87440daa703030f4c402e7a41b9221a149768` before this change. All eight relevant source files remain byte-identical to the earlier qualification at `5653e04fa90f11cb0d387f40f8eaed5660085746`.

## Source gap

The settings `LoginTerminal` writes PTY data into xterm but never calls `ptyAckBytes`. The backend counts every forwarded byte and pauses its reader at 512 KiB outstanding. The general terminal's ACK handler ignores settings terminal IDs because they are absent from its `live` map. This is a source-supported stall risk, not an observed native login stall.

The retained real-app REA chain joins `ONi` to `nZe`, the `qc` runtime alias, `DAt`, the session controller, and its output handler. That handler records consumed raw byte counts in an ACK buffer and forwards them to the live backend session's `pty_ack_bytes` bridge. The inherited complete `ONi` and `nZe` spans are retained under `../login-terminal-completion/reference/`; this directory holds the additional alias and ACK spans. `reference-source.json` records exact byte ranges, asset hashes, the original upload hash, and REA lineage. Earlier semantic renderer analysis exhausted the heap. The source spans were checked against the retained original shipped bytes, without evaluating reference JavaScript.

## Frozen mounted regression

`src/settings/agents/loginTerminalAck.test.ts` mounts the real `LoginButton` and `LoginTerminal` using the frozen completion fixture's factory. It substitutes xterm and PTY boundaries and controls the xterm write callback. The inherited fixture and its assertions are unchanged.

The seven ACK cases cover:

- Raw subarray byte counts, including non-ASCII and invalid UTF-8 bytes, acknowledged only after the xterm callback.
- Output that arrives before the spawn promise resolves.
- Rendered output beyond the backend's 512 KiB high watermark, with a simulated credit counter.
- A rejected ACK promise without interrupted completion, Done, cleanup, or status refresh.
- Foreign, pre-spawn, lifecycle, and empty events without byte credit.
- A late write callback after dismissal without an ACK or a status refresh.
- A completed but usable shell that still acknowledges output until Done.

The initial regression is expected to fail five assertions on the unchanged product. Two event-filtering and dismissal controls are expected to pass. These results are unrun until qualified hosted logs are recorded. The credit counter tests bridge calls under the backend's documented limit; it does not execute the Rust gate or a real PTY.

The ACK fixture is frozen at SHA-256 `5821ea8f116268a176b3b3ad042dada17658024efdf3e754fc6e882d859afb09`. The inherited completion fixture is frozen at `b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7`. The baseline component is frozen at `624389bd708832a56fdaddb80e2ac567c2b0901002be3e9ca5501de91f73e778`.

## Verification limits

The source-only archive, asset, span, fixture, and baseline checks passed on the Reason cloud computer. Automatic hosted CI runs the existing `node --test "src/**/*.test.ts"` command. No workflow change, manual dispatch, local Node execution, native executor, provider, credential, or cloud Claude/Codex path is added.

No screenshot was captured. Native rendering, a real login shell, real IPC flow control, provider acceptance, and side-by-side acceptance remain unverified.
