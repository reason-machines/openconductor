# V3: bind discard selectors to their real surfaces

Conductor Rebuild · `DIFF-UNCOMMITTED-DISCARD-AFFORDANCE-DE6-01`

This addendum records a fixture correction, not a product fix or runtime grant.
The original `README.md`, `permanent-regression.md`, v1/v2 manifests and retained
reference source remain historical checkpoints and are not rewritten.

## Observed v2 result: harness failure, not semantic RED

The separately admitted v2 command ran on the Reason cloud computer on
2026-11-18, with actual group release at `01:23:53.094716Z`. Four independent
context-menu controls passed. The six row/header cases stopped at their initial
All-scope selection assertion: the row query found two buttons, and the header
query found zero. None reached the Uncommitted-visibility assertion or the
return-to-All confirmation. All ten teardown paths passed zero Git discard,
zero native/clipboard/provider calls, timer release and deterministic DTO-read
assertions. There were no skipped or cancelled cases. This is not product RED.
Exact raw-output and receipt identities remain in `frozen-v3.json`.

## Correction justified by actual product topology

Freshly fetched main `06c5fefc9a13fbae9acb743c5d4cd1d1673689eb` still renders
both buttons with the path-qualified label `Discard changes to ${file.path}`.
They live in separate `oc-change-row` and `oc-file-header` containers. V3 binds
each existing search to the corresponding real container; it does not change
the expected count, the selected file, toolbar interaction, test bodies, policy
wrapper, menu controls, I/O boundaries or teardown assertions.

The original v2 bytes are retained as `frozen-v2.mounted.test.mjs.txt`.
`frozen-v3.json` pins both versions and both exact string replacements.
`verify-reference.py` now checks v1 → preserved v2 → live v3, including the
byte-identical block containing all ten cases. It remains a data-only verifier:
it executes neither the mounted fixture nor any retained vendor JavaScript.
Its success is an integrity result, not evidence of product behavior.

## Treatment is prepared, not applied

The retained Conductor 0.87.6 REA spans establish two separate contracts:

- `iyi` returns null outside All changes. Both the compact row and file header
  reach that same lower guard, despite their broader callers.
- `Svs` independently opens context-menu Discard using All scope, including
  Uncommitted, commit and turn views. That policy must remain unchanged.

The prepared treatment changes only the `discardScope("view", ...)` return to
All changes outside turn view and explicitly revises the one contrary old unit
expectation. Its comment is corrected too. The historical test and earlier
interpretation in `target-ref.md` remain preserved; the complete lower guard,
not the desired implementation, justifies the supersession. There is no Git
scope/discard implementation or component rewrite.

Apply no product treatment until the unchanged v3 fixture reaches the intended
semantic RED with passing independent context-menu and zero-I/O controls.
Then the same v3 bytes must run on treatment under separate admission, followed
by the relevant target-policy unit suite and existing CI. The already-enabled
CI step selects the same fixture in the existing frontend job; it adds no job,
trigger, installation or baseline-failure run.

## Unverified behavior

V3 has not executed at this source-preparation checkpoint. Product treatment,
GREEN, adjacent unit/runtime checks and exact-head CI remain pending. No new
browser, native, provider or destructive Git operation ran, and this fixture
cannot establish visual parity or native behavior. There is no new admission
requirement: use the existing serialized RED10-v3 queue and original supervisor.
