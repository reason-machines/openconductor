# Clone basename normalization

Conductor Rebuild compares the retained Conductor 0.87.6 frontend with main
`021aeaa4027770258b4daae127bc829d1575d0ab`.
The frozen test-only baseline was published at `f16feeda5ccd7735be95aa615d7e70d18f7a7048`.
Hosted TypeScript and Rust each reproduced four intended assertion failures
and passed all four controls before the minimal helper correction.

## Source

[reference.json](reference.json) identifies the original archive, two shipped
assets, 15 exact source spans and six current-main files. Full original spans
and current snapshots are preserved in the Session attachment
`clone-basename-source-021aeaa4.tar.gz`, SHA-256
`7bb9ef4cb8762cb55db4dd58da7a84ac4670a64a2e6cf12af547f8261bc9dfc9`.

The complete original `los` dialog has independent URL and Location fields.
There is no separate suggested-name or manual-name input. It submits only
`remoteUrl` and `clonePath`. No new name field is justified.

The joined original path is `los -> vYe/tQt -> _n.createRepo -> _2t.createRepo
-> g2t`. Its service factory `cRa -> n7r/uQt` supplies
`sanitizeRepoName: R2t`. `g2t` derives the remote basename through `Wy/UM`,
then lowercases and sanitizes it through `R2t` before uniqueness and destination
path joining. Its optional service-level `name` is not a dialog control.

Current `cloneTargetName` and native `repo_name_from_url` preserve mixed case
and repeated hyphens. For example, the source-derived name for remote
`MyRepo.git` is `myrepo`; current code derives `MyRepo`. This is a static
source comparison, not an executed clone.

## Frozen regression

The new TypeScript fixture and Rust module each contain four intended
normalization failures and four controls. They call the existing pure helpers
with synthetic URLs. Controls preserve lowercase HTTPS and SCP names, dots and
underscores, and local `My App` path basenames. Existing service tests also
require unchanged local-path clone names. No real remote, picker or filesystem
operation is introduced.

[fixture.sha256](fixture.sha256) freezes both fixtures before behavioral RED.
Both new normalization fixtures stay byte-identical across RED and GREEN.
Assertions check returned names rather than private calls or source strings.

Ordinary automatic hosted CI runs the fixtures with:

- `node --test "src/**/*.test.ts"`.
- `rustc --edition 2021 -D warnings --cfg workspace_std_only --test mod.rs`
  followed by the resulting workspace test binary.

[TypeScript RED](hosted-red-typescript.json) records job `130901900767` in
run `43133135117`; lines 18261–18403 show all four intended name assertions
failing and all four controls passing. [Rust RED](hosted-red-rust.json) records
job `130901900750` in run `43133135292` with the same four failures/four controls.
The typecheck passed, but the build step was skipped after the test failures.
The [separate shared baseline failure](hosted-shared-baseline-failure.json) is
`disclosureRemount.test.ts` rejecting drift in `src/scripts/api.ts`. Its repair
belongs to PR #1109 and is not part of this clone correction.

The candidate changes only `cloneTargetName` and `repo_name_from_url`. Both
lowercase the derived remote basename, replace non-`[a-z0-9-_.]` characters
with hyphens, collapse hyphens and trim edge hyphens in that order. Local
path basenames remain unchanged. Rust uses Unicode lowercasing rather than
assuming ASCII lowercasing is equivalent. No exhaustive cross-runtime Unicode
equivalence is claimed. Raw URL transport, parent paths, uniqueness and safety
checks are unchanged; neither frozen fixture nor reference identity is edited.
Every exact-head check and workflow must pass before merging the fix, including
the shared baseline repair after it lands on main.

## Candidate integration

Hosted candidate `b8c0fd22b6e40bf923ac80156097738fe70315a3` passed all eight
sealed TypeScript normalization cases and both platform workspace lifecycle
jobs. Its frontend job exposed five existing component failures: the pending
recent-selection and URL text-correction fixtures still expected unsanitized
`First`, `RecentRepo` and `MixedCase` derived names. Only those three expected
`name` literals are migrated to `first`, `recentrepo` and `mixedcase`. Their
mixed-case raw URLs, request capture, retry, form-editability and duplicate-submit
assertions remain unchanged. This is an intentional contract migration, not a
change to either sealed regression fixture.

[Hosted candidate receipt](hosted-candidate-before-integration.json) records
the eight passing cases and the five obsolete name assertions before migration.
The sixth frontend failure is the already-owned disclosure preflight. Merged
main `382da31580a5698feb223e1a3607fc79119fb77a` supplies PR #1109
through an ordinary main merge, without cherry-picking, repinning or changing
its frozen proof. The clone helper diff is unchanged by this integration.

## Shared-repair integration

The next candidate consumes actual merged main
`78fb7b664e1d88f31c28d050fad2ecba5cd1c1dc`, including #1116's complete
historical prefix source isolation and #1118's Python fake-login fixture
budgets. No cherry-pick, repin or duplicate repair is used. Both product helpers,
sealed clone fixtures and retained reference evidence are byte-identical to
candidate `f55bad6cc06dbd7bcf84e82a204cd9fb7195cf37`. The prefix replay and
login-test files are identical to this merged main.

On Reason Cloud, `python3 -m unittest discover -s evidence/settings/custom-prefix
-p test_replay.py -v` now passes all four assembly tests against the live clone
helper; the earlier three naming-hash failures no longer occur. Both sealed
clone fixture checksums and `git diff --check` pass. These Python/static checks
are not the hosted Node/Rust semantic replay or native acceptance. The new
exact-head automatic workflows must all pass before merge.

## Verification and limits

`python3 evidence/dialogs/clone-basename-normalization/verify_source.py <archive>`
passed on Reason Cloud. Archive identity, both asset identities, all 15 spans,
six baseline snapshots and both fixture checksums passed. `git diff --check`
and unchanged-product-helper comparison passed.

The historical REA renderer semantic analysis exhausted heap. This pass reads
identity-verified retained bytes as data and does not execute Conductor code.
No fresh binary identity, local Node or Cargo test, native launch, physical
input, picker, provider, real cloning or visual acceptance was exercised.
No screenshot exists because this lane has no local runtime/native admission;
native acceptance is owned separately. Candidate GREEN and consuming-main
package verification remain pending under the existing PR subscription.
