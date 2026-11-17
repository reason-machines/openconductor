# Create project implicit Enter — qualification only

Conductor Rebuild / SAME6013 / `CREATE-PROJECT-IMPLICIT-ENTER-6013`.

## Current result

Fresh main checked: `ea436c5ea0ce33338bd082df998ff61dc3e43460`.
All seven relevant current files are byte-identical to qualification main
`073c7b4e2287598f795c350b8fdb5358122c4a06`.

The frozen mounted regression ran before any production change:
**4 passing controls / 2 intended form-ancestor assertion failures**, with no
setup failure, cancellation or skip. This establishes the mounted topology,
**not** actual browser implicit submission. Adjacent Create project pending
controls and state tests passed **14/14** unchanged.

There is no production correction yet. The separately admitted trusted-key
Chrome baseline now reproduces both discrepancies: plain Enter from name and
parent each starts **one inert creation request**, versus the retained reference
contract of zero. The eight-case control results, full original browser tool
readbacks and cleanup receipt are preserved in `browser-baseline-*.json`.
Native, live-original side-by-side and packaged acceptance are **NOT_RUN**.

## Trusted Chrome baseline — 2026-11-17

- **Capability passed:** independent native form counted 1, 2, 3 submissions
  after name Enter, parent Enter and real primary mouse click.
- **Expected RED reproduced:** name and parent plain Enter each recorded trusted
  key, implicit click and submit events and one pending request. No test code
  invoked a submit/click adapter.
- **Activation controls passed:** configured Meta+Enter from each field and real
  primary mouse click each made exactly one captured request with slug
  `fixture-project`, parent `/synthetic/project-root`, template `empty`.
  The real DialogFrame shortcut internally invokes the button; its resulting
  click is correctly preserved as untrusted, unlike the initiating trusted key.
- **Disabled/pending controls passed:** blank plain/Meta+Enter stayed at zero;
  pending plain/Meta+Enter/disabled-button mouse click stayed at one. Both drafts
  accepted real `Input.insertText` edits without changing the captured request.
- **Isolation passed:** frozen actual-component bundle; connections and form
  navigation denied by CSP; no completions, closes or errors in any case.
- **Cleanup passed:** preview `b50854eb-0a78-4fa7-ae4c-0e72a837fd54`, port 48733,
  started 17:00:00.090Z; stopped by 17:06:28Z (deadline 17:15:00.090Z). Own tab
  1440146772 closed and managed tabs empty. Preview worker attested process-group
  exit and free preview port; status stopped/listening null. Separate Bash
  namespace bind passed, own fixture processes empty. The Bash bind alone does
  not establish preview-namespace release; the worker receipt does.
- **Evidence verification passed:** `python3
  evidence/dialogs/create-project-implicit-enter/verify-browser-baseline.py`
  checks all eight raw readbacks against their decoded records, observed controls,
  original bundle/input identities and all three frozen served assets.

Three inspected screenshots were durably published; Markdown is retained in
`browser-baseline-media.json`. The existing qualification page was updated at
https://reasonmachines.com/agents/6013adf2-e94a-4a6d-9be7-bbd07622cf3c?page=f30d2043-6c9c-4e5e-81b1-b6f5150205c0.
A production/harness lease and separately serialized treatment slot were
requested from the ledger; this baseline grant does not admit treatment.

## Retained reference

The complete retained Conductor `gbi` Quick-start declaration supplies a div
body, configured `dialog.primaryAction` name handler and explicit primary click.
Its `kg → nd → Rde` closure does not supply an enclosing native form; `Rde`
defaults to a div. Shared input/button render and shortcut matcher/default
closures are retained, not inferred from matching UI strings.

`qualification-original.json` records the two full original-asset hashes, 23
byte-bound complete declarations/import/default bindings, seven baseline source
hashes and all six frozen fixture hashes. REA acquisition lineage and the earlier
semantic-renderer heap gap remain attributed in that manifest. The original
JavaScript is untrusted data and was not executed.

## Commands and decisive receipts

```bash
python3 evidence/dialogs/create-project-implicit-enter/verify-qualification.py
node --experimental-strip-types --test --test-concurrency=1 src/components/createProjectImplicitEnter.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/components/createProjectPendingControls.test.ts src/state/createProject.test.ts
node .ara-state/create-project-enter-6013/build.mjs
```

- `source-check.json`: **PASS**, two original identities, 23 retained spans,
  six frozen fixture files and seven source files at fresh main.
- `baseline.tap`: **expected RED**, four controls pass; both text-input ancestor
  checks encounter the actual native form. Test SHA-256 stays
  `ef16dfbf4826994da9c22884c58b078869555f041de37f189dab2f8740d857a6`.
- `adjacent-before.tap`: **PASS**, 14/14; no assertion or harness was changed.
- `bundle-build.json` / `bundle-baseline.json`: **PASS**, 189 bundle inputs.
  Actual CreateProjectDialog, DialogFrame and KeybindingsProvider are included.
  Only the component's backend, workspace API and first-workspace service
  imports are replaced by the frozen inert I/O module. No actual backend,
  native bridge or provider service module is in the graph. CSP denies
  connections and form navigation.

The frozen plan specifies eight independent normal-input browser cases:
native-form capability default actions; plain Enter from name and parent;
configured Meta+Enter from each; real mouse primary click; blank name; and
already-pending Enter/Meta+Enter/click. A direct React onSubmit invocation is
explicitly not a browser-default-action witness. Browser code must not invoke
onSubmit/requestSubmit/submit/button.click to manufacture outcomes.

## Boundaries

Qualification-test/setup plus one consumed and released baseline-browser lease
only. No component, DialogFrame, provider, helper/backend, pending-controls
harness, styling or native/package change. No real project/files/GitHub
operation, native picker, full heavy pipeline or watcher was started.

Source/Node preparation and the isolated Chrome baseline ran on the Session's
Reason cloud computer. Existing exclusive native/package custodians remain
unchanged. Treatment requires a separate ledger grant.
