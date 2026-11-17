# Custom Claude executable Version row

Conductor Rebuild hides only the Version row when a custom Claude executable is set. The default executable keeps its existing version. Authentication, other row values and order, the source login object, and all status suppliers stay unchanged.

## Reference

Retained Conductor 0.87.6 source shows `jpa` reading `claude_executable_path` through `dxe`. It passes `false` as the third argument to `Yki` for a truthy override. `Yki` includes Version only when that argument is truthy. The retained setting registry joins this reference key to `claude_code_executable_path`.

[Source spans and provenance](source.json) include the original archive and asset identities and the retained REA evidence ID. This is shipped-byte source inspection, not reference runtime observation. The historical REA semantic renderer pass exhausted heap. No fresh native acquisition or reference JavaScript execution ran.

## Behavioral verification

On Reason Cloud computer 355, the frozen test mounted the production ClaudeTab, real auth projector, and real status-table renderer. Synthetic status replaces external inputs. Every native, provider, credential, refresh, and settings operation throws if called.

The fixture SHA-256 is `70b1d5ead8ba243c5579e6e54e7ec3add78242ef48af07a6ba167adea47ce0cf`, unchanged before and after the patch.

- Before the fix: **failed as intended**, four Version visibility assertions failed and six controls passed. Exit 1.
- After the fix: **passed**, the identical ten cases passed. Exit 0.
- Adjacent controls: **passed**, all 23 existing cases passed. Exit 0.
- Lockfile and fixture integrity, retained source-span identity, and `git diff --check`: **passed**.

The cases cover both auth modes, null and empty default paths, a raw truthy override, signed-out and missing-key table guards, missing version, path changes while mounted, and clearing the override. Each case verifies that no external operation ran and the original login object was not mutated.

[Checks and exact commands](checks.json) bind the run to the full current-main hash recorded in that JSON. [Raw runtime records](runtime-records.tar.gz) preserve the unmodified TAP, commands, exit codes, dependency-restore log, and before/after hashes. The bundle compresses raw whitespace without normalizing the logs.

To reproduce the candidate:

```bash
NODE_OPTIONS=--max-old-space-size=768 timeout --kill-after=10s 120s nice -n 19 node --test --test-concurrency=1 src/settings/agents/claudeCustomExecutableVersion.test.ts
```

To reproduce the original baseline with the identical test, also set `CLAUDE_VERSION_SOURCE_FILE=evidence/settings/claude-custom-executable-version/ClaudeTab.baseline.tsx.txt`.

## Limits

Browser, screenshot, native app, package, real CLI, provider, credential, clipboard, and login acceptance were **not run**. Browser and native execution were outside the admitted synthetic-only scope, so there is no screenshot. Local full-project typecheck and build were **not run**. Automatic exact-head CI is reported on the pull request, separately from these local results. Manual-only workflows were not dispatched and are not claimed as passing.

This change is not part of the existing owner's frozen package cut until that owner includes it. No release executor or watcher was created. The separate Claude account-metadata and Codex cached-account proposals remain outside this change.
