# Provider key links stay available while editing

Conductor Rebuild owns `settings-secret-editor-get-key-64`: the `SecretRow` editor's `getKeyUrl` condition and its new regression. The ledger found no competing exact hunk in its partial ownership search. No terminal, authentication-continuation, provider, or credential implementation is included.

## Source qualification

The retained REA analysis of the real Conductor app has evidence ID `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its semantic renderer analysis exhausted the heap. This change uses exact shipped-byte slices, not a new native acquisition or execution of reference JavaScript.

The original Session upload `conductor-dxe-source-closure.tar` has SHA-256 `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`. Its renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

- `YWt`, UTF-8 bytes `[10252774, 10254426)`, returns the masked row only when a key exists and editing is inactive. In its editor branch, `r!==void 0` independently retains **Get key** when the provider URL exists. **Cancel** is conditional on a configured key.
- `n$i`, bytes `[10248914, 10250561)`, owns the form input and trimmed, nonempty, nonpending submit guard.
- `Zla`, bytes `[10250685, 10252749)`, owns the masked row's edit action.

Fresh main `435c3356902c3e7cdf246f3089029154b3f908f6` contains #1062's Codex login fix. Its `kit.tsx`, SHA-256 `5da43355c0757ecea46c4cf94db9272af5565ddfc2be5ad799abf668c7d4007a`, still adds `!configured` to the editor's provider-link condition. This hides the link when replacing an existing key. The product fix removes only that guard.

The archive, three literal slices, baseline equality, and bounded declarations passed the Python verifier:

```bash
python3 evidence/settings/secret-editor-key-link/verify_source.py /path/to/conductor-dxe-source-closure.tar
```

The source receipt records static qualification, not behavioral RED/GREEN. Cancel/commit leaf declarations yielded no separate defect; global Escape and blur behavior remain insufficiently evidenced and are outside this change.

## Frozen four-case regression

`src/settings/agents/secretEditorKeyLink.test.ts` mounts the actual transpiled `SecretRow` with React test renderer. It does not replace the component or its local state. Four cases cover:

1. Editing a configured Anthropic key retains its exact provider link, then Cancel returns to the masked row.
2. Editing a configured OpenAI key retains its exact provider link, then Cancel returns to the masked row.
3. An unconfigured key keeps its link without Cancel.
4. Editing a key without a provider URL does not invent a link.

The link opener is a recording stub. Save, delete, and reveal callbacks throw if called. No real key, browser, native bridge, provider, or stored credential is accessed. The fixture SHA-256 is `37a6e0de84b4ecacfa31ff59467158eacc01f4c23ce75957f2d47676fe053686`.

```bash
node --test src/settings/agents/secretEditorKeyLink.test.ts
```

The fixture is discovered by the repository's existing automatic frontend checks. No workflow, dispatch, or rerun is added.

## Hosted baseline and candidate replay

Test-only published head `f9d53d8319a5e5dd98892ce1d1c4d5d5f17a4953` reproduced behavioral RED in [frontend unit job 130671849242](https://github.com/reason-machines/openconductor/actions/runs/43063424590/job/130671849242). Exactly the two configured-editor cases failed at the missing-link assertion. Both controls passed. The full suite ran 2,925 tests with only those two failures. [Retained four-case TAP excerpt](hosted-baseline-four-cases.tap.txt) records the assertions, not a setup failure.

`secretEditorKeyLinkProof.test.ts` replays the byte-identical four-case fixture against the retained baseline, then the candidate. It requires four completed cases, exactly the two expected baseline assertion failures, and all four candidate cases passing. Skips, cancellations, missing cases, child-process failures, and setup failures cannot satisfy the proof. The replay runs in normal automatic hosted CI:

```bash
node --test src/settings/agents/secretEditorKeyLinkProof.test.ts
```

Candidate GREEN is pending. No local Node or render runtime was started. The #1062 frozen five-case fixture remains byte-identical.

## Verification boundary

- PASS: original-byte/source qualification against main `435c33569`, baseline equality, static fixture identity, exact one-line product comparison, and hosted baseline RED.
- PENDING: hosted candidate GREEN and complete exact-head CI.
- NOT RUN: local Node or render checks, screenshot, native rendering, installation, real browser opening, persistence, real provider, and real IPC.
- No screenshot is available because browser/native execution is outside this lane's admitted runtime scope.
- Hosted mounted tests can prove component transitions and callback routing, not final native parity or successful provider authentication.
