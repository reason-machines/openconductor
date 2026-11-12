# Run output selection to chat

Conductor Rebuild rebound this unit to fetched main `f55d0330ff32e790c08a26d2e7aa83dbf2b8ea32`, after cursor PR #1110 actually merged as `a677de02b420fed88486580114e48616d4663912`. The three product files match that main exactly at this test-only milestone. The cursor role fix and eight sealed cursor cases are unchanged.

## Source evidence

The retained real-app REA acquisition is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Two complete asset hashes and sixteen unique byte spans qualify `nro → OJs → xEi → surface registry → aSa/lSa → rSa → iSa/nSa`. The original JavaScript is read and hashed, never evaluated. This is retained shipped-source evidence, not a fresh installed-app observation.

Run's `rSa` observes terminal selection. `iSa` exposes Add to chat for nonblank text and a session id. The action normalizes the text, creates a terminal-selection text attachment and requests attachment to that session. Mutation success clears React action state, not the xterm selection. Process-running state does not gate the action. Setup's `gno` has no equivalent action. Exact source identities, byte offsets, callsite lines and observations are in [source.json](source.json); the retained excerpts are under [reference](reference).

Main already has the guarded draft-attachment callback in WorkspaceView and a selection action in generic TerminalHost. PanelStrip forwards the callback/chat id only to TerminalHost, not ScriptsPanel. Run's ScriptOutput has no selection subscription or action. The exclusive future product scope is three files: ScriptOutput selection state/action, optional props and ordinary Run forwarding in ScriptsPanel, and forwarding existing props at PanelStrip's ScriptsPanel call. Setup and Spotlight must remain excluded; WorkspaceView, chat, backend, generic terminal, font and geometry stay unchanged.

## Frozen test-first baseline

`src/scripts/runOutputSelection.test.ts` mounts the actual current PanelStrip, ScriptsPanel and ScriptOutput with real React effects. Only xterm, DOM/observers, native IPC, terminal inventory and unrelated presentation/settings hooks are controlled boundaries. The candidate loader reads live source; no historical source is substituted or repinned.

Ten cases are sealed in [cases.json](cases.json):

1. Nonblank, normalized selection requires a chat id and callback, including blank/control-only and missing-callback checks.
2. Full normalized text reaches the existing strip callback without truncation.
3. Stopping Run retains selection action, output and terminal instance while disabling stdin.
4. Accepted callback clears action state without clearing xterm selection.
5. Rejected callback retains the action for retry.
6. Changing chat target uses the current callback, not a stale one.
7. Workspace replacement/unmount disposes old selection subscriptions.
8. Setup has no action.
9. Spotlight has no ordinary-Run action.
10. Standalone output with input retains its no-action default.

Seven Run cases are intended counterexamples; three role controls must pass. The unexecuted preparation was refined before sealing to cover missing callbacks and control-only text; its former preparation hash is not represented as an executed baseline. No product fix may precede actual assertion RED at the production call chain. Loader, dependency, syntax, typecheck and missing-fixture failures are not behavioral RED. Then the smallest correction must pass these same sealed bytes and every exact-head workflow before merge.

## Verification and limits

Passed on Reason Cloud:

```bash
python3 evidence/scripts/run-output-selection-1f/verify_source.py --original-dir .oc-tmp/scripts-audit-1222/originals
sha256sum -c evidence/scripts/run-output-selection-1f/fixture.sha256
git diff --check
```

The source check verifies two complete original assets, sixteen retained spans, three baseline snapshots and all ten sealed cases. Fresh-main source/caller checks also passed before publication; seven source identities are recorded. These are read-only checks, not behavior.

Ordinary automatic hosted CI runs `node --test "src/**/*.test.ts"`. Hosted RED/GREEN and typecheck/build remain pending. The first published head `fd6d43ed` failed typecheck with two optional-component overload errors and one implicit callback parameter type error, before build. Those compiler failures do not qualify as product RED. The type-only follow-up captures narrowed component aliases before the nested render function and annotates the string callback. [The original full fixture and exact four textual changes](type-correction-v1/change.json) are retained. All ten scenario bodies/assertions remain byte-identical, verified by an independent scenario-tail hash and an exact reconstruction check; only the full-fixture checksum changes. No product correction is included. At corrected head `202c4119`, hosted unit job `130924002692` ran but stopped seven Run cases and Setup at an omitted Tooltip boundary export; Spotlight had no output because status alone does not populate its log. The standalone control passed. Nine failures/one control are not the intended behavioral baseline. The next fixture-only correction preserves Tooltip children and feeds the actual Spotlight started-event reducer so the control mounts output. [Exact boundary correction and prior full fixture](boundary-correction-v2/change.json) retain every scenario/assertion byte and prior checksum. Product code remains unchanged; qualified RED still awaits hosted execution. No new local Node/Rust, browser, native app, provider, manual dispatch/rerun, watcher or shared harness change ran. No screenshot is available because browser/native execution is not admitted for this lane. Mocked selection events and synchronous callback acceptance do not prove selection painting, physical input, native focus, actual asynchronous attachment transfer or provider submission. This reuses draft attachment, not submit.

Ledger ownership is exclusive to Session `1f14fa82-4ec3-41fc-b085-32ec441b4228`, confirmed by ledger owner `ddfc6518` message `4fb76496-af1e-4708-b887-870815ffe940`. Test-first ready publication is authorized only after the actual #1110 merge and fresh rebind; both conditions were checked. Starting-body, disclosure repair, Settings LoginTerminal and the parked OSC8 lead are not duplicated.
