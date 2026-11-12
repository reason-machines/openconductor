# Login terminal resize after a settled exit

Conductor Rebuild owns the bounded `settings-login-settled-exit-resize-dispatch` slice. The first publication adds the callback regression without changing production code.

## Source contract

The retained real-app REA packet has SHA-256 `905673096c7ce456bc291b8087312ae0874549bfdc6c757fcec803ff9aa4e38e` and evidence ID `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its original receipt remains unchanged in [historical-source-receipt.json](historical-source-receipt.json).

The shipped local backend `ySt` marks only its matching exited PTY dead before emitting exit, then skips subsequent backend resize. Its controller still updates local screen geometry before calling that backend. The embedded settings terminal reaches this controller through the retained renderer import and runtime export. These are static observations of the pinned shipped assets, not native runtime observations.

The fresh source rebind checked default-branch commit `f55d0330ff32e790c08a26d2e7aa83dbf2b8ea32`. All 13 reference spans, 19 source pins, 24 static checks, and the changed-byte identity control passed. The current settings callback dispatches resize when its PTY id exists, including after its matching exit. The native resize path is read-only in this change.

## Callback regression

The fixture mounts the actual `LoginButton` source. It substitutes only React renderer host nodes, Xterm/FitAddon, ResizeObserver, provider-independent home-directory lookup, and the external PTY transport. ResizeObserver triggers local fit, which emits the registered Xterm resize callback. Assertions inspect the transport payload and local dimensions, not copied application conditions.

Two target cases resize after a settled matching exit, both with and without earlier command completion. Three controls cover a running shell, a completed but live shell, and a foreign PTY exit. Every case requires local fitting to stay active. No test invokes a real provider, native app, login command, or IPC.

Automatic hosted CI runs the new file through its existing `node --test "src/**/*.test.ts"` step. Baseline qualification requires exactly the two named transport assertion failures and all three controls passing. A bootstrap, typecheck, or unrelated failure does not qualify. Production code stays unchanged until those failures are observed.

Initial head `ca5fc79c` hit a fixture-only TypeScript declaration failure before the build's behavioral step. The repository has no `react-test-renderer` declaration package. The correction supplies the minimal external renderer boundary signatures, without adding a dependency. The [lineage receipt](fixture-type-boundary-repair.json) and [rejected original fixture](fixture-v1.typecheck-rejected.ts.txt) preserve the old digest. The verifier requires every executable byte from the TypeScript loader onward, including all cases and assertions, to remain identical across this typing-only correction. This compiler failure is not behavioral RED.

The corrected fixture digest and historical source remain frozen for the later minimal guard. No scripts, registry, generic PTY manager, Garry, or caffeinate changes are included.

## Verification

Static source and fixture verification passed on the Reason cloud computer. Behavioral baseline and candidate runs are pending automatic hosted CI.

```bash
python3 evidence/settings/login-terminal-settled-exit-resize/verify_source.py <original-conductor-source-archive>
node --test src/settings/agents/loginTerminalResize.test.ts
LOGIN_TERMINAL_RESIZE_SOURCE_FILE=evidence/settings/login-terminal-settled-exit-resize/baseline-parts.tsx.txt node --test src/settings/agents/loginTerminalResize.test.ts
```

Only the Python verifier and `git diff --check` were run locally. The Node commands above document replay and were not run locally. Native screenshot proof is not applicable to this transport-only unit, and no native or provider behavior is claimed.

## REA limits

The earlier semantic renderer analysis exhausted its heap. The retained evidence supplies exact shipped bytes, not a new semantic run. The matching shipped native resize implementation and macOS return or error behavior remain unverified. The callback test cannot establish a crash, visible failure, or process resize after exit.
