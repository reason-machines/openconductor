# Clone basename normalization

Conductor Rebuild compares the retained Conductor 0.87.6 frontend with main
`021aeaa4027770258b4daae127bc829d1575d0ab`.
This is a test-only baseline. Product code is unchanged and behavioral RED has
not run yet.

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
No existing fixture or assertion is changed. Test Behavior, Not Implementation
keeps assertions on returned names rather than private calls or source strings.

Ordinary automatic hosted CI runs the fixtures with:

- `node --test "src/**/*.test.ts"`.
- `rustc --edition 2021 -D warnings --cfg workspace_std_only --test mod.rs`
  followed by the resulting workspace test binary.

Product changes must wait for the intended four failures and four passing
controls in each boundary. A compilation or infrastructure failure is not RED.
Every exact-head check and workflow must pass before merging the eventual fix.

## Verification and limits

`python3 evidence/dialogs/clone-basename-normalization/verify_source.py <archive>`
passed on Reason Cloud. Archive identity, both asset identities, all 15 spans,
six baseline snapshots and both fixture checksums passed. `git diff --check`
and unchanged-product-helper comparison passed.

The historical REA renderer semantic analysis exhausted heap. This pass reads
identity-verified retained bytes as data and does not execute Conductor code.
No fresh binary identity, local Node or Cargo test, native launch, physical
input, picker, provider, real cloning or visual acceptance was exercised.
No screenshot exists because this baseline changes no product UI and native
acceptance is owned separately. Package verification follows a green merge.
