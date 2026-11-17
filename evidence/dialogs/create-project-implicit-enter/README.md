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

There is no production correction yet. A separately admitted actual trusted-key
browser baseline is required before requesting a production lease. Browser,
native, live-original side-by-side and packaged acceptance are **NOT_RUN**.

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

Qualification-test/setup lease only. No component, DialogFrame, provider,
helper/backend, pending-controls harness, styling or native/package change.
No preview server, managed tab, runtime dispatch, real project/files/GitHub
operation, native picker, full heavy pipeline or watcher was started.

The source/Node preparation ran on the Session's Reason cloud computer. Existing
exclusive runtime/native/package custodians remain unchanged. A trusted-key
baseline request was sent to the existing serialized ledger queue; it is not
runtime admission.
