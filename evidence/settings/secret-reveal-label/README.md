# Secret reveal action name

Conductor Rebuild changed only the hidden `SecretRow` toggle's accessible name from `Show ${label}` to `Reveal ${label}`. The visible `Hide ${label}` name, pressed state, masking, busy state, callbacks, error handling, and provider architecture are unchanged. The separate Remove-indicator proposal is not included.

## Retained Conductor evidence

[The retained renderer span](reference/Zla.literal.txt) computes `c ? Hide : Reveal` and passes the result to the reveal button's `aria-label`. [The configured-row producer](reference/YWt.literal.txt) supplies that row. [The source receipt](reference/source-receipt.json) records their hashes, original archive, UTF-8 offsets, and historical REA lineage.

These are shipped renderer bytes, not a fresh native observation. The historical semantic-renderer REA analysis exhausted its heap. This change reuses the retained source witness and does not claim native accessibility or screen-reader parity.

## Executed validation

The sole runtime allocation was `ACC_64_REVEAL4_20261113T0332`. [The receipt](validation/receipt.json) records exact commands, nonsecret environment, phase bounds, timestamps, exits, hashes, and the qualified execution tree. Main `efcaf69210c3b389ee5c077f4272df0c8809e40a` was included through a normal merge at local head `22e8971cd655175e95515ccad6a76b21c8ffb169`. All seven execution inputs matched the admitted main `d2602d267460dd67e467e7622f1ee357c085bca2` byte for byte.

The frozen four-case fixture and inspector were not edited. Own-root React, React DOM, and react-test-renderer 18.3.1 and TypeScript 5.9.3 were reused without installation.

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
  nice -n19 timeout --signal=TERM --kill-after=5s 90s \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/agents/secretRevealLabel.test.ts
```

- Baseline RED qualified. Exactly the Anthropic and OpenAI hidden-name assertions failed with actual `Show` and expected `Reveal`. The absent-toggle and visible-Hide controls passed.
- Identical-fixture GREEN passed all four cases after the one-string fix. No cases were skipped, cancelled, or marked TODO.
- The unchanged inspector accepted both raw TAP streams. [Baseline output](validation/red.stdout.txt) and [candidate output](validation/green.stdout.txt) are retained.

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
  nice -n19 timeout --signal=TERM --kill-after=5s 120s \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/agents/secretEditorKeyLink.test.ts \
  src/settings/agents/kitModel.test.ts

NODE_ENV=development NODE_OPTIONS=--max-old-space-size=1536 \
  nice -n19 timeout --signal=TERM --kill-after=5s 180s \
  npx --no-install tsc --noEmit
```

All nine adjacent tests passed. The actual checkout typecheck passed using its installed local compiler. The only typecheck stderr was an experimental HTTP proxy warning.

The driver restored the candidate and deactivated the fixture before its explicit release at `2026-11-13T03:39:07.765133Z`. No owned process groups remained. The same tested product and fixture bytes were then applied for publication. Inclusive elapsed time was 229.434 seconds. Recovery, inspection, and driver preparation before the sequential driver consumed 186.587 seconds of that wall time. The driver's source guard took 0.067 seconds, but the full pre-test wall time exceeded the allocation's 60-second source allowance. This is a scheduling-contract gap, not a failed regression. It was reported to ACC without rerunning tests or extending runtime. Complete process-tree peak RSS was not sampled.

## Unverified behavior

No browser, native app, screen reader, provider, real credential operation, package build, or full workflow dispatch ran. There is no screenshot because this allocation excluded UI and native execution. Package inclusion and native acceptance remain with the existing release owners. A merged source change does not establish either result.
