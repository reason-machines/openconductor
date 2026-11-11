# Login terminal command completion

Conductor Rebuild checked main `524c598b34157483e669167ed1f9032cc02fff18`.

## Source gap

`ClaudeTab` and the Codex CLI branch call `LoginButton` in `parts.tsx`. Its `LoginTerminal` appends `; exit` to the login command and treats every PTY exit as successful command completion. The header then says the shell remains usable.

The retained real-app source joins `jpa` and `Fpa` to `Met`, then `ONi`, `Z7o`, and the `nZe` session observer. `Z7o` emits a completion marker without forcing the interactive shell to exit. `ONi` tracks completion independently of shell exit. `rTo` reports a premature exit when completion has not been observed. Done dismisses the terminal and refreshes status. Close dismisses without refreshing.

These are static declarations, not observed native behavior. The retained REA lineage and its earlier semantic-analysis heap limit are recorded in `reference-source.json`. No reference JavaScript was evaluated.

## Regression-first increment

`src/settings/agents/loginTerminal.test.ts` mounts the actual `LoginButton` and terminal effect with substituted terminal, PTY, home-directory, and observer boundaries. It initiates no real CLI, authentication, provider, credential, browser, or native operation.

The ten cases cover shell-preserving bootstrap, completion before PTY exit, usable input after completion, premature exit, foreign completion markers, late ready and exit events, Close, spawn failure, listener registration, fast completion, and late-spawn cleanup. Some cases exercise more than one related condition.

The fixture is frozen at SHA-256 `b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7`. The current product snapshot is frozen in `baseline-parts.tsx.txt`, SHA-256 `21e4f365407020b2d7e6da3c75b4605948cf04e89315ee2220cd9771a4218348`.

Hosted execution is pending. The expected baseline failures are the missing shell-preserving bootstrap, completion without exit, premature-exit header, listener-before-spawn ordering, and preservation of fast completion. No behavioral result is claimed until the hosted job reaches those assertions.

## Verification

Passed on the Reason cloud computer, without product execution:

```bash
python3 .rea-work/auth-continuity-audit-current/verify_reference.py <original-conductor-dxe-source-closure.tar>
git diff --check
```

The source check verified the original archive, both asset hashes, seven exact reference spans, eight literal declarations, and seven current-main source pins. `verify_source.py` provides the committed, read-only equivalent for the retained reference files and frozen fixture.

Automatic CI runs the existing frontend test glob. No workflow trigger, timeout, retry, or general terminal implementation is changed. Local Node, browser, native, provider, and credential execution are not admitted. Native rendering, real shell and login behavior, real IPC, and side-by-side visual acceptance remain unverified. No screenshot was captured.
