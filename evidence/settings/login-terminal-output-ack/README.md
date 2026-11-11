# Login terminal output acknowledgements

Conductor Rebuild re-read main `15e87440daa703030f4c402e7a41b9221a149768` before this change. All eight relevant source files remain byte-identical to the earlier qualification at `5653e04fa90f11cb0d387f40f8eaed5660085746`.

## Source gap

The baseline settings `LoginTerminal` writes PTY data into xterm but never calls `ptyAckBytes`. The backend counts every forwarded byte and pauses its reader at 512 KiB outstanding. The general terminal's ACK handler ignores settings terminal IDs because they are absent from its `live` map. This is a source-supported stall risk, not an observed native login stall.

The correction captures each chunk's raw `byteLength` and acknowledges it from the xterm write callback using the reserved terminal ID. Empty chunks and callbacks after dismissal return no credit. Bridge rejection does not interrupt completion or cleanup. Command markers, queued-output exit classification, Done, Close, and provider refresh semantics are unchanged. Only the import and data callback change in product code.

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

The initial hosted head `b36169859965e6a5a9379b96681d5f77feb27bda` failed exactly the five intended ACK assertions and passed both event-filtering and dismissal controls. The [unit job](https://github.com/reason-machines/openconductor/actions/runs/43094148011/job/130778542227) ran `node --test "src/**/*.test.ts"` against unchanged product code. [The retained seven-case segment](hosted-baseline.tap.txt) and [qualification receipt](hosted-baseline.json) separate this behavioral RED from source checks.

`loginTerminalAckProof.test.ts` replays the unchanged seven-case fixture against the frozen baseline and the candidate. It requires the exact five baseline failures, both passing controls, all seven candidate passes, complete TAP summaries, and no skipped or cancelled cases. It also verifies both fixture hashes and the baseline hash. Candidate execution awaits normal automatic hosted CI at this increment.

The credit counter tests bridge calls under the backend's documented limit. It does not execute the Rust gate or a real PTY.

The ACK fixture is frozen at SHA-256 `5821ea8f116268a176b3b3ad042dada17658024efdf3e754fc6e882d859afb09`. The inherited completion fixture is frozen at `b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7`. The baseline component is frozen at `624389bd708832a56fdaddb80e2ac567c2b0901002be3e9ca5501de91f73e778`.

## Verification limits

The source-only archive, asset, span, fixture, and baseline checks passed again on the Reason cloud computer before the correction. All eight pins match current main `15e87440daa703030f4c402e7a41b9221a149768`. Automatic hosted CI runs the existing `node --test "src/**/*.test.ts"` command. No workflow change, manual dispatch, local Node execution, native executor, provider, credential, or cloud Claude/Codex path is added.

No screenshot was captured. Native rendering, a real login shell, real IPC flow control, provider acceptance, and side-by-side acceptance remain unverified.
