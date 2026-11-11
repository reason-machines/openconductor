# Tool disclosure across chat remounts

Conductor Rebuild checked main `167492e56dbbb90850efbadf1db2848dae7622f2` before publishing this regression. All eight source pins in the inherited BE7 comparison are unchanged from its original checked main. The assigned branch remains `reason/task-64baa6b6`; the pull request targets `main`, not another pull request.

## Source evidence

The retained Conductor 0.87.6 renderer has a module-lifetime `dIt` expansion store. Uncontrolled `Mu` rows read that store through their caller's persistence key and write it only after a manual toggle. `O0o` supplies the Read tool-call id. `gpo` supplies the plan tool-call id and starts expanded. An explicit stored false is distinct from an untouched default.

Current `WorkspaceView` keys `ChatPanel` by the selected chat. That destroys and remounts `Transcript` when switching between chats. `Transcript` currently holds manual tool choices in a mount-local map. This source difference is not yet a reproduced behavioral defect.

`source-lineage.json` retains the original REA evidence id, exact ranges, hashes, and limitations. `requalification.json` binds the comparison and frozen baseline `Transcript` to the current main above. `repository-fixture.json` and the fixture's own freeze record the final integrated files; the supporting rebind receipt also retains the earlier loader hashes before its whole-module replay override. The original renderer was inspected statically, not executed. Earlier REA semantic renderer analysis exhausted heap; the exact retained shipped bytes remain the source evidence.

## Frozen behavioral check

`src/features/chat/disclosureRemount.test.ts` enters the existing automatic frontend test glob. It loads the dedicated five-case fixture in `tests/chat-disclosure`.

The fixture loads full production `WorkspaceView`, `ChatPanel`, `Transcript`, and `ToolRows` modules. It uses the production initializer, reducer, tab click handler, provider-snapshot subscription, row click handler, `aria-expanded`, and rendered content. It does not copy or replace those state or toggle handlers. Native transport and provider boundaries are synthetic. Markdown decoration and unrelated UI leaves are substituted.

The two intended baseline failures are:

- `read-open-return` must retain a manually opened Read row after chat A, chat B, then chat A.
- `plan-closed-return` must retain a manually closed default-open plan after the same chat switches.

The controls cover a distinct tool id in chat B, a same-chat rerender, and manual collapse through real `garry_mode` preference updates. The Garry control preserves existing behavior and is not a new original-parity claim.

A loader failure, import failure, transport assertion, timeout, incomplete run, or failure in a control does not qualify as behavioral RED. Product code must remain unchanged until both intended assertion failures and all three passing controls have actually run.

## Verification

Passed on the Reason cloud computer without product execution:

```bash
python3 evidence/chat/tool-disclosure-remount/verify_source.py <original-conductor-dxe-source-closure.tar>
git diff --check
```

The verifier checks the original archive, renderer identity, seven exact reference spans, eight current-main source pins, 132 loader dependency pins, five frozen fixture files, and the complete frozen baseline `Transcript` snapshot.

The automatic hosted frontend jobs run:

```bash
node --test "src/**/*.test.ts"
```

No local Node, React, browser, Rust, native, provider, credential, database, or package execution has run. No screenshot is provided because the UI has not been run. Current baseline behavioral RED and subsequent candidate GREEN are pending. All exact-head workflows must pass before merge.

Only `Transcript` tool-map lifetime and dedicated regression/evidence files belong to this change. Workspace producers, closed-chat catalogs, APIs, backends, models, labels, summary expansion, and Settings display wiring are outside scope. The merged login fixtures remain unchanged.
