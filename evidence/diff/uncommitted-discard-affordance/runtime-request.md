# SAMEDE6: separate private DEPS_ONLY prerequisite

Conductor Rebuild. Prepared source only; this document grants no runtime lease.
The existing ledger must explicitly reserve each phase after its predecessor is
released. Queue order reported by ledger: 1F GREEN15 → 49 RED7 → 135 RED20 →
SAMEDE6 DEPS_ONLY → SAMEDE6 RED10. No aggregated DEPS/RED/GREEN execution.

## Immutable inputs

- Assigned branch: `fix/appearance-search-rows-and-terminal-font`.
- Frozen checkpoint `385ca26dd`; source verifier checkpoint `38ced3cd1`.
- Frozen fixture: `tests/diff/uncommittedDiscardAffordance.mounted.test.mjs`,
  12,891 bytes, SHA-256
  `356522ce6cc1a129b4e3536346e5c45e217d1cf6e6860cfef09cbe840e97f506`.
- `package-lock.json` SHA-256
  `2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992`.
- `package.json` SHA-256
  `4bb4f30b331c3dcb97902768e412fd0a75a79420438795c11f4b8d6aaa422e91`.
- Expected installed identities: React and react-test-renderer 18.3.1,
  TypeScript 5.9.3, @pierre/diffs 1.6.4, fuzzysort 3.1.0.
- Helper: `deps-only.py` in this directory. Its exact digest accompanies the
  reservation request and is not embedded recursively in this file.

## One dependency-only operation, only after explicit reservation

```bash
python3 evidence/diff/uncommitted-discard-affordance/deps-only.py --execute-deps-only
```

The foreground Bash call must have timeout 335 seconds. The Python supervisor
runs exactly one `npm ci --ignore-scripts --no-audit --no-fund` in this checkout,
with private `.oc-tmp/uncommitted-discard-runtime/npm-cache` and this checkout's
initially absent `node_modules`. It does not copy another dependency tree,
modify the manifest/lock, run lifecycle scripts, tests, builds or native work.

The child process group is pinned to CPU 0 (no fallback), nice 10,
`UV_THREADPOOL_SIZE=1`, `NODE_OPTIONS=--max-old-space-size=768`, npm jobs 1.
Polling at 0.1 seconds totals live child-group RSS and checks free disk. Abort
at RSS above 2 GiB, disk below 4 GiB, a signal or 300 seconds; terminate the
child group, allow at most 5 seconds, then kill remaining members. Cleanup has
at most 30 seconds, inside a 335-second outer budget. The helper handles TERM,
INT and HUP and records whether the child group was actually released.

Success removes the private npm cache, retains owned node_modules for the
separately admitted RED, and records installed versions without running Node.
Failure removes only its owned modules/cache. No retry is implicit. The receipt
is `.oc-tmp/uncommitted-discard-runtime/deps-receipt.json`; npm output is a
private file alongside it. No process or watcher survives the foreground call.

After the eventual final runtime phase, or if cancellation leaves no future
phase, the bounded ownership-checked cleanup command is:

```bash
python3 evidence/diff/uncommitted-discard-affordance/deps-only.py --cleanup-owned-deps
```

That cleanup has a 30-second internal budget and should use a 35-second Bash
call. It refuses missing/mismatched ownership or symlink targets. It touches
neither Git refs nor fixtures, evidence, six held candidates or other checkouts.

## Later phases, not admitted by this request

Report actual DEPS_ONLY result, exact installed identities and child-group
release before requesting RED10. The mounted command for that next request is:

```bash
node --experimental-strip-types --test tests/diff/uncommittedDiscardAffordance.mounted.test.mjs
```

The expected product RED is six Uncommitted row/header visibility failures,
four passing All-scope menu controls and zero Git/native calls. Setup errors do
not qualify. Only after RED and a separately acknowledged phase transition is
the minimal view-discard predicate/contrary old assertion corrected, then the
identical frozen fixture rerun for GREEN under its own explicit reservation.
Fresh main/source equality must be checked before treatment. No browser/native
admission is requested here. Ready publication remains same-owner/main-based;
any known saved-record fault must not receive an unchanged retry.
