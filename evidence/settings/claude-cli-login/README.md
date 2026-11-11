# Keep the local Claude login action visible

Conductor Rebuild owns this regression and delivery.

## Source contract

Checked main `248b6c359c830c6ac5e050721bae18e44e168068` hides `LoginButton` when the CLI status reports authenticated. Retained Conductor 0.87.6 `jpa` selects its key control or `Met` only by authentication mode. Its connected status is sent separately to `t$i`. `Met` renders its idle login button without an authentication condition.

[Reference source and REA lineage](reference-source.json) retain full `jpa`, `Met`, `Mpa` and `Ppa` literals, byte offsets and hashes. This is retained shipped-source evidence, not native UI observation. The upload was absent at the initial checkpoint. During E2E follow-through, the original uploaded archive became available and all four slices matched its shipped renderer byte for byte; [the revalidation receipt](e2e-reconciliation.json) records the archive and slice identities against main `6ea86f222815a43ab12355eee2afbdcd981b2164`. This is not a new Mac acquisition. The earlier REA semantic renderer analysis exhausted heap; that limitation remains.

The product candidate removes only the authenticated guard on the CLI login control. API-key mode, credential storage, status production, login execution and first-connected-runtime selection are unchanged. This does not add cloud Claude/Codex or transfer any credential.

## Regression

`src/settings/agents/claudeLoginVisibility.test.ts` mounts the actual `ClaudeTab`, `LoginButton` and `AuthStatus` with React's test renderer. It uses real authentication selection rules and controlled status input. Unrelated layout leaves and the status hook are substituted; native, terminal and credential operations throw if reached. These simulated status inputs are unit-test inputs, not parity evidence.

Run the unchanged fixture against the retained baseline:

```bash
CLAUDE_LOGIN_SOURCE_FILE=evidence/settings/claude-cli-login/baseline-ClaudeTab.tsx.txt \
  node --test src/settings/agents/claudeLoginVisibility.test.ts
```

The intended baseline contract is exactly four completed tests, two assertion failures and two passing controls. Only `connected CLI retains Run claude /login` and `refreshing connected CLI retains Run claude /login` fail with `CLI mode must keep the login action regardless of connected status`. Signed-out CLI and API-key controls pass. Setup, import or type errors are not the intended RED.

Run against the candidate:

```bash
node --test src/settings/agents/claudeLoginVisibility.test.ts
npm run typecheck
```

The candidate requires all four unchanged cases to pass. Ordinary hosted CI discovers this file with `node --test "src/**/*.test.ts"`.

## Verification boundary

- Source closure and `git diff --check` passed before publication.
- Hosted baseline RED passed its expected-failure contract at `3486831e0e52f6378a97740b7e43d66f361dfe10`. The [unit job](https://github.com/reason-machines/openconductor/actions/runs/43035703593/job/130574016946) completed 2,807 cases with exactly the two intended missing-button failures. Signed-out CLI and API-key controls passed. The [retained job excerpt](baseline-hosted.txt) contains all four outcomes.
- Candidate mounted GREEN, the frontend suite, typecheck and build passed at `2c71652a` and again after the supported base update at `f5084edfb80edb2f3dca71d9e786fea3f1230e92`. The four-case fixture is unchanged, SHA-256 `ba44c1b9f7fe7ec83f7e663ec63923f07423d26098e7a4037ccd763ad44aef70`.
- The baseline built-app jobs failed during Ubuntu dependency installation before app behavior. Prerequisite #1044 repaired that setup on main `6ea86f22`; the updated candidate passed dependency installation, debug app build, Codex stand-in chat and the initial Claude import chat turn. These are hosted stand-in results, not real-provider execution.
- The [updated candidate E2E job](https://github.com/reason-machines/openconductor/actions/runs/43049843580/job/130623616642) failed in the Claude step at line 263, `no login prompt`. The existing script required the connected CLI action to be absent, opposite to the retained `jpa` and `Met` source contract. Its second CLI-mode assertion had the same obsolete expectation. Both now require exactly one enabled `Run claude /login` button and zero embedded terminals. API-key mode additionally requires zero CLI login buttons and zero terminals. Account, version, credential isolation and chat-turn assertions are unchanged. No assertion is skipped and the login action is never clicked.
- The [hosted screenshot](https://api.reasonmachines.com/media/pr-screenshots/129f5892-a909-4eef-a831-df8bd218dda3/7b8132b2c804e5da93f1386d2546e6cc/claude-cli-e2e-failure.png) from the failed predecessor job visibly shows Connected, the stand-in account and the idle login action together. This is Ubuntu app evidence from that head, not corrected-E2E GREEN, a macOS screenshot or side-by-side parity.
- Corrected E2E and all checks on the next published head await ordinary automatic hosted CI. `git diff --check`, original-byte verification, frozen fixture identity and unchanged product-source checks passed before that publication. No local Node, Rust, browser, native app or provider execution was started.
- Mounted tests do not prove Rust IPC, terminal spawn, actual account switching, native appearance or side-by-side parity.
- Existing E1 runtime order and frozen retry, PINNED V2 and badge packets are unchanged.
