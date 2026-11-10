# Restore after a checkout hook failure

Conductor Rebuild compared archive restoration on main `e1687ee` with retained Conductor 0.87.6 extracted JavaScript. OpenConductor returns immediately when `git worktree add` exits nonzero. Conductor checks whether the requested worktree was created and continues with a warning when it was.

## Retained reference

Artifact `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The retained artifact owner, Session `1f14fa82-4ec3-41fc-b085-32ec441b4228`, supplied the complete `iWt` excerpt in receipt `5b8d37c1-a7df-4d36-a06f-beffbd3a88ac`. Zero-based, end-exclusive character range `[3289007,3290299)`, UTF-8 byte range `[3289507,3290799)`. This Session read the retained excerpt, not the raw chunk, and did not rehash or extract the app in this pass.

When worktree creation exits nonzero, `iWt` checks `git worktree list --porcelain` for the exact target. A registered worktree yields the auxiliary message "Something failed while creating your workspace. Check the logs to see what went wrong." An unregistered target remains an error. `PY`, character range `[3304884,3306790)`, continues checkpoint and context recovery after `iWt` and reports its auxiliary message.

This is retained shipped-source evidence, not native execution. See [archive reference traces](../NOTES.md).

## Reproduction

A disposable, canonicalized Git repository with a local `post-checkout` hook that exits 7 produced all of these results on Reason Cloud:

- `git worktree add` exited 7.
- The exact requested worktree remained registered.
- Its checked-out file contained the committed bytes.
- stderr contained the fixture hook message.

The temporary repository was removed after the probe. No app or real user repository was used.

The production regression `restore_continues_when_post_checkout_hook_fails_after_creating_the_worktree` archives staged, unstaged, and untracked changes, installs the failing hook, then restores through the production archive API. It requires successful recovery and the warning. A second regression requires an actual worktree-add failure to remain fatal even when a different registered path shares the target prefix.

## Local validation limit

The single admitted offline command was:

```bash
CARGO_BUILD_JOBS=1 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 \
RUSTFLAGS='--cfg workspace_std_only' \
cargo test --offline --locked --manifest-path .archive-harness/Cargo.toml \
  workspace_archive::tests::restore_continues_when_post_checkout_hook_fails_after_creating_the_worktree \
  -- --exact
```

It failed before compilation because the current computer has no cached `serde` package. See [offline attempt](offline-attempt.log). No production test ran. No dependency download, install, or retry occurred. The compile reservation was released after confirming no visible Cargo or compiler process and no generated target directory.

Production RED and GREEN are pending. `git diff --check` passed. Native restoration, screenshots, visual parity, and app runtime acceptance are NOT RUN. Include-file collision and overwrite behavior are unchanged.
