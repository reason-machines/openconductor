# Keep the local Claude login action visible

Conductor Rebuild owns this regression and delivery.

## Source contract

Checked main `248b6c359c830c6ac5e050721bae18e44e168068` hides `LoginButton` when the CLI status reports authenticated. Retained Conductor 0.87.6 `jpa` selects its key control or `Met` only by authentication mode. Its connected status is sent separately to `t$i`. `Met` renders its idle login button without an authentication condition.

[Reference source and REA lineage](reference-source.json) retain full `jpa`, `Met`, `Mpa` and `Ppa` literals, byte offsets and hashes. This is retained shipped-source evidence, not native UI observation. The original upload is absent after recovery. Its previously retained literal identities are checked, not a newly acquired app archive. The earlier REA semantic renderer analysis exhausted heap; that limitation is retained, not silently upgraded to fresh evidence.

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
- Hosted baseline RED is pending at the test-first publication. No product edit is included yet.
- No local Node, Rust, browser, native app or provider execution. There is no screenshot because native/browser acceptance is not admitted for this lane.
- Mounted tests do not prove Rust IPC, terminal spawn, actual account switching, native appearance or side-by-side parity.
- Existing E1 runtime order and frozen retry, PINNED V2 and badge packets are unchanged.
