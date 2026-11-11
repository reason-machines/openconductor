# Login terminal command completion

Conductor Rebuild first checked main `524c598b34157483e669167ed1f9032cc02fff18`, then re-read main `58fc17bc1f6a61db0624eb9a6aba85d2b3cbf5a9` before the repair. All seven retained caller/terminal source pins were byte-identical.

## Source gap

`ClaudeTab` and the Codex CLI branch call `LoginButton` in `parts.tsx`. Its `LoginTerminal` appends `; exit` to the login command and treats every PTY exit as successful command completion. The header then says the shell remains usable.

The retained real-app source joins `jpa` and `Fpa` to `Met`, then `ONi`, `Z7o`, and the `nZe` session observer. `Z7o` emits a completion marker without forcing the interactive shell to exit. `ONi` tracks completion independently of shell exit. `rTo` reports a premature exit when completion has not been observed. Done dismisses the terminal and refreshes status. Close dismisses without refreshing.

These are static declarations, not observed native behavior. The retained REA lineage and its earlier semantic-analysis heap limit are recorded in `reference-source.json`. No reference JavaScript was evaluated.

## Regression-first increment

`src/settings/agents/loginTerminal.test.ts` mounts the actual `LoginButton` and terminal effect with substituted terminal, PTY, home-directory, and observer boundaries. It initiates no real CLI, authentication, provider, credential, browser, or native operation.

The ten cases cover shell-preserving bootstrap, completion before PTY exit, usable input after completion, premature exit, foreign completion markers, late ready and exit events, Close, spawn failure, listener registration, fast completion, and late-spawn cleanup. Some cases exercise more than one related condition.

The fixture is frozen at SHA-256 `b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7`. The current product snapshot is frozen in `baseline-parts.tsx.txt`, SHA-256 `21e4f365407020b2d7e6da3c75b4605948cf04e89315ee2220cd9771a4218348`.

[Automatic hosted baseline job](https://github.com/reason-machines/openconductor/actions/runs/43082827122/job/130739522725) at test-only head `a03427ac60561dd261d09f86cc7a35937b065df7` reached exactly the five intended assertion failures: shell-preserving bootstrap, completion without exit, premature-exit header, listener-before-spawn ordering, and preservation of fast completion. All five controls passed. The aggregate had 3,025 tests, 3,020 passes, five failures and no skips/cancellations/TODOs. The frontend typecheck/build job failed at its unit-test step on the same five regressions, not at TypeScript compilation. The selected hosted log (trailing spaces on two blank lines trimmed) and qualified case identities are retained in `hosted-baseline.log` and `hosted-baseline.json`.

## Focused repair

Only `LoginTerminal`, its state type and `terminalHeader` change. The bootstrap emits the retained OSC 633 completion marker without `exit`. A terminal ID is reserved before spawn, observation is registered first, and command completion remains independent of PTY exit and spawn resolution. Done and Close preserve their separate refresh/cleanup behavior. A premature exit remains an error; late ready events cannot overwrite a terminal outcome. Output drains through the xterm write callback before exit is classified, because the backend drains PTY output before emitting exit but the renderer parses it asynchronously.

`loginTerminalProof.test.ts` replays the byte-identical ten-case fixture against the frozen baseline and candidate, requiring exactly the expected five RED failures followed by ten GREEN passes with strict TAP counts and assertion signatures. `loginTerminalBoundary.test.ts` adds five safety cases using the retained fixture factory without changing its assertions: stable pre-resolution terminal identity, delayed-start dismissal, the real non-rendering xterm parser ignoring echoed bootstrap text and accepting a split OSC, and both completion/premature-exit output-drain outcomes. Terminal/PTY/provider boundaries remain substituted; the real xterm parser case is not native UI or real IPC proof.

[Automatic hosted candidate unit job](https://github.com/reason-machines/openconductor/actions/runs/43084667229/job/130745820383) at `435ef36adbad8fde5156b3967016add1d11cae1c` passed all ten unchanged assertions and the strict paired baseline RED/candidate GREEN replay. The five supplemental cases failed during fixture setup with `Cannot read properties of undefined (reading 'ok')`, before reaching their assertions. Their CommonJS transpilation omitted `esModuleInterop`, leaving the fixture's default `node:assert/strict` import undefined. The follow-up enables that compiler option only; product code, frozen fixture, and all supplemental assertions remain unchanged. Supplemental GREEN and all exact-head checks remain pending. No product execution was performed locally.

## Verification

Passed on the Reason cloud computer, without product execution:

```bash
python3 .rea-work/auth-continuity-audit-current/verify_reference.py <original-conductor-dxe-source-closure.tar>
git diff --check
```

The source check verified the original archive, both asset hashes, seven exact reference spans, eight literal declarations, and seven current-main source pins. `verify_source.py` provides the committed, read-only equivalent for the retained reference files and frozen fixture.

Automatic CI runs the existing frontend test glob. No workflow file, trigger, timeout, retry, or general terminal implementation is changed. Local Node, browser, native, provider, and credential execution are not admitted. Native rendering, real shell and login behavior, real IPC, and side-by-side visual acceptance remain unverified. No screenshot was captured.
