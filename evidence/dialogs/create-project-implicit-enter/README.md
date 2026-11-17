# Create project — explicit primary activation

Conductor Rebuild / SAME6013 / `CREATE-PROJECT-IMPLICIT-ENTER-6013`.

## Current result

Fresh main checked before treatment: `74c004a95d7b10072f54f71ca611f22c50944f64`.
All seven relevant current files are byte-identical to qualification main
`073c7b4e2287598f795c350b8fdb5358122c4a06`.

The frozen mounted regression ran before any production change:
**4 passing controls / 2 intended form-ancestor assertion failures**, with no
setup failure, cancellation or skip. This establishes the mounted topology,
**not** actual browser implicit submission. Adjacent Create project pending
controls and state tests passed **14/14** unchanged.

The trusted-key Chrome baseline reproduced both discrepancies: plain Enter
from name and parent each started **one inert creation request**, versus the
retained reference contract of zero. All eight baseline records and original
assets remain preserved without modification.

The leased production correction replaces only the native form with the same-class
div and wires the existing primary button explicitly, matching Clone's established
pattern. The configured shortcut remains owned by the unchanged DialogFrame.
The unchanged frozen Node regression is now **6/6 PASS**; adjacent tests are
**14/14 PASS**. Fixture-scoped TypeScript checking, the 189-input bundle graph,
and reference/source verification also **PASS**. The separately admitted browser
treatment ran all eight frozen cases and **PASS**: plain Enter in both fields
now makes zero requests while explicit activation and every disabled/pending
control retain their baseline outcomes. Combined affected Create project/Clone
tests pass **53/53**. Admitted sequential `npm run build` **PASS**
(branding + full TypeScript + Vite 40.08s), then `npm run lint:colors` **PASS**
(six checker tests + 1,265-file scan). No compiler/build/lint processes remain.
Full-app, live-original side-by-side, macOS/WebKit and packaged acceptance are
**NOT_RUN**.

`verify-treatment.cjs` proves exactly five product replacements and two legacy
harness selector/transport ports. All **54 legacy assertion calls** and **seven
complete test declarations** remain byte-identical. The original harness is
archived under `baseline/`; the six-case test remains byte-identical to its
frozen copy. `pre-treatment-*.{tap,json}` preserve the immediate pre-edit checks;
`treatment-focused.tap` records all 20 passing tests.

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

## Trusted Chrome treatment — 2026-11-17

- Same frozen eight cases, normal CDP key/mouse input and synthetic values.
  No test code invoked a click/submit adapter. The real DialogFrame shortcut
  still supplies its programmatic primary click.
- Independent capability form still recorded **1/2/3** trusted submits.
- Name and parent plain Enter: **one baseline request → zero**, trusted
  keydown/keyup only, with the primary still enabled.
- Name/parent Meta+Enter and real primary mouse click: **one request** each.
- Blank plain/Meta+Enter: **zero**. Pending Enter/Meta+Enter/disabled-button
  mouse click: **one total**, both drafts editable, captured request unchanged.
- All eight raw readbacks retain their original tool-output source/revision.
  `verify-browser-treatment.py` validates raw/decoded identity, values,
  shortcuts, actual events and request counts. The baseline blank record stores
  values as strings and parent focus as outerHTML; treatment records element
  metadata/id. The verifier checks those schemas explicitly. Cross-run focus
  parity is not claimed.
- The baseline raw records and compressed served assets are byte-identical to
  pre-treatment commit `ce44fd2a8a8c`; no baseline was overwritten. Treatment
  keeps the same 189-input graph and frozen fixture sources; only the leased
  component differs. `bundle-treatment.json` and compressed treatment assets
  retain the actual served build.
- Two inspected screenshots were durably published; links are retained in
  `browser-treatment-media.json`. Fixture CSS is deliberately minimal and is
  not full-App visual parity evidence.
- **Cleanup PASS:** one tab `1440146774`, preview
  `628ba776-2c07-4cd2-b74d-fb16dd2ac87f`, port 48733. Actual start
  **17:22:36.388Z**, strict deadline **17:37:36.388Z**, explicit release by
  **17:28:58Z**. Own tab closed, managed tabs `[]`, preview stopped/listening
  null, worker-confirmed process group exit/free port, independent namespace
  bind PASS and own fixture processes `[]`. No server remains running.

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
node evidence/dialogs/create-project-implicit-enter/verify-treatment.cjs
python3 evidence/dialogs/create-project-implicit-enter/verify-browser-baseline.py
python3 evidence/dialogs/create-project-implicit-enter/verify-browser-treatment.py
node --experimental-strip-types --test --test-concurrency=1 src/components/createProjectImplicitEnter.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/components/createProjectPendingControls.test.ts src/state/createProject.test.ts
node .ara-state/create-project-enter-6013/build.mjs
npm run build
npm run lint:colors
```

- `source-check.json` / `pre-treatment-source-check.json`: pre-edit
  `verify-qualification.py` **PASS**, two original identities, 23 retained spans,
  six frozen fixture files and seven source files at fresh main. The original
  verifier deliberately requires baseline product bytes; use
  `verify-treatment.cjs` on the corrected checkout.
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

The production lease covers only CreateProjectDialog and the two exact legacy
harness ports, plus the dedicated frozen regression and this evidence directory.
DialogFrame, provider, helper/backend, styling and native/package code are unchanged.
Both separately admitted browser leases are consumed and explicitly released.
No real project/files/GitHub operation, native picker or watcher was started.
Only the explicitly admitted sequential frontend build/lint pipeline ran;
no native/provider/package pipeline was dispatched.

Source/Node preparation and the isolated Chrome baseline ran on the Session's
Reason cloud computer. Existing exclusive native/package custodians remain
unchanged. Treatment requires a separate ledger grant.
