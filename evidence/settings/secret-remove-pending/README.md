# Secret Remove pending feedback

Conductor Rebuild adds an operation-specific pending indicator to the configured SecretRow Remove action. The indicator stays visible until the existing `onDelete` promise resolves or rejects. The accessible name, disabled policy, callback count, error text, shared cleanup, Reveal behavior, save behavior, and local-only provider architecture are unchanged.

## Retained Conductor source

The [source receipt](source-preparation-receipt.json) records the original upload, retained REA lineage, nine exact renderer spans, eleven source pins, and protected Reveal and tab-ID fixtures. The [YWt span](reference/YWt.txt) sets a removal flag before invoking the callback and clears it in `finally`. [Zla](reference/Zla.txt) selects the working indicator while that flag is set. [ri](reference/ri.txt) and [Kss](reference/Kss.txt) identify the declared working-loader selection.

This is retained shipped-source evidence, not a fresh native observation. The historical REA renderer-analysis heap failure remains a limitation. The decorative 16px SVG follows OpenConductor's existing ResetChatDialog precedent; exact Conductor animation and pixel equality are not claimed.

## Fixture correction and original failure

The [original frozen fixture](secretRemovePending.test.ts.txt) remains unchanged. Its first candidate run passed two cases and failed the two rejection-message assertions because the host-created Error did not share the evaluated VM's Error constructor. [The original raw output and receipt](validation-0342/receipt.json) remain preserved, including the 2-pass, 2-fail candidate output.

The separately approved [harness supplement](harness-realm-supplement-v1/receipt.json) changes only the VM context from `{}` to `{ Error }`, following existing repository loaders. Its inverse reproduces the original fixture exactly. It does not edit assertions, case identities, product code, or the expected error text. The corrected frozen fixture is mounted unchanged at `src/settings/agents/secretRemovePending.test.ts`.

The four cases cover Anthropic and OpenAI labels, each with resolve and reject outcomes. They use only a deferred fake `onDelete` promise. Save, reveal, backend, URL, provider, clipboard, and real credential actions are forbidden by the fixture. They do not load styles or establish animation behavior.

## Executed qualification

The [renewed allocation receipt](validation-0514/receipt.json) records exact arguments, nonsecret environment, all phase timestamps, exits, source hashes, dependency versions, and inspector results. Its [sequential driver](validation-0514/run-admitted-0514.py) is preserved as an execution record, not a standalone replay without its original packet paths.

Qualification ran in this Session's own checkout on Reason Cloud computer 355. Main `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba` was incorporated through a normal merge at local head `3573af6181f3a096a875b7d10180a3f36e2a569b`. Reveal #1223's squash `6e1c5e9d38c4d35aa7042edbbcfb6eed0b6d891c` was present. Reversing only its known label prefix reproduced the original sealed Remove baseline; every other pinned input matched. The original candidate patch was applied without replacing the whole kit snapshot or undoing Reveal or tab IDs.

Identical baseline and candidate command:

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
SECRET_REMOVE_SOURCE_FILE="$PWD/src/settings/agents/kit.tsx" \
  nice -n19 timeout --signal=TERM --kill-after=5s 90s \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/agents/secretRemovePending.test.ts
```

- Baseline RED reproduced exactly four missing-pending-indicator assertions, with actual 0 and expected 1. No setup, import, timeout, or unrelated failure qualified as RED.
- Identical corrected-fixture GREEN passed all four cases, with no skips, cancellations, or TODOs.
- The strict TAP inspector accepted both complete streams. [Baseline output](validation-0514/red.stdout.txt) and [candidate output](validation-0514/green.stdout.txt) are retained without normalizing their assertions.

Adjacent command, executed once:

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
SECRET_REMOVE_SOURCE_FILE="$PWD/src/settings/agents/kit.tsx" \
  nice -n19 timeout --signal=TERM --kill-after=5s 120s \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/agents/secretRevealLabel.test.ts \
  src/settings/agents/secretEditorKeyLink.test.ts \
  src/settings/agents/kitModel.test.ts
```

All 13 adjacent tests passed, with no skips, cancellations, or TODOs. All three adjacent fixtures remained byte-identical.

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=1536 \
SECRET_REMOVE_SOURCE_FILE="$PWD/src/settings/agents/kit.tsx" \
  nice -n19 timeout --signal=TERM --kill-after=5s 180s \
  npx --no-install tsc --noEmit
```

The actual-checkout typecheck passed using installed local TypeScript 5.9.3. React, React DOM, and renderer 18.3.1 were reused in the own checkout; no installation or dependency change occurred. Root and installed lockfiles stayed unchanged.

Actual source preparation began at `05:19:49.308771Z` and took 204.128 seconds of its 300-second bound, including recovery, inspection, and driver preparation. The full renewed allocation took 243.945 seconds of its 1560-second bound. Test and typecheck phases met their bounds without retries. Explicit release occurred at `05:23:53.253746Z`, with the candidate restored, fixture inactive, and all owned process groups absent. Publication then reapplied only the exact tested product and corrected-fixture bytes.

The earlier Reveal allocation's 186.587-second preparation exceeded its 60-second source bound. That prior timing gap and the original Remove failures are not waived or relabelled by this successful renewed allocation. Complete process-tree peak RSS was not sampled.

## Remaining acceptance

No browser, native app, provider, real credential operation, Rust check, package build, preview, or manual workflow dispatch ran. There is no screenshot because this allocation explicitly excluded UI and native execution. SVG animation, CSS rendering, native accessibility, and exact pixels remain unverified.

Existing 992, ACC, and E1 owners retain the package and native route. On a containing artifact, acceptance requires an inert configured Anthropic and OpenAI row: idle trash icon; exactly one fake Remove callback; a decorative 16px pending indicator and disabled Remove with its unchanged accessible name; restored idle state after resolve and reject; and unchanged rejection text. Do not exercise real credentials or actual removal to obtain this proof. Merge, package inclusion, and native acceptance are separate states.
