# Follow-up pending candidate and SendKey composition

This checkpoint belongs to Conductor Rebuild's existing SAME49 Settings lane.
It adds an unapplied candidate and test fixtures, not a new runtime request.
All JavaScript fixtures and typecheck remain **not run**.

## Historical source closure

The parent [REA record](../source.json) identifies the retained Conductor 0.87.6
assets and extraction receipt. The renderer semantic analysis exhausted its
heap. These spans are read-only extraction from those shipped bytes, not a
successful semantic analysis or observation of the installed app.

The parent packet retains the complete USER registration and the
`W9r` import to `zQt` export binding. `zQt` calls `Be` with mutation key
`updateDefaultMessageSendMode` and mutation function `JUt`.

The added [source record](source.json) retains the following ownership chain.

- `Be` lazily creates one `Zqe` observer per hook instance. The key is not a global pending flag.
- `Zqe.mutate` builds a new cache mutation and observes that mutation. Its result computes `isPending` from the mutation status.
- `jqe.execute` enters pending before awaiting the writer. After success callbacks settle, it dispatches success. On rejection, its `finally` dispatches error even if an error callback throws. Both terminal statuses clear `isPending`.
- `JUt` awaits `gee`, which returns `ee.updateSetting`. `JUt` does not return or inspect the writer's boolean. A resolved `false` therefore follows the reference mutation's success path; it is not a rejected promise.
- The retained settings-service method has refused-write returns and awaited persistence paths. The captured service binding assigns the same implementation to `ee` and `Ie`. No persistence implementation is changed or executed here.
- The retained client config has global mutation error logging, `networkMode: "always"`, and no success or settlement callback. The core mutation defaults retries to zero. `Be` catches the returned mutation rejection through `Ir`.

This closes the static pending-state ownership and settlement chain. It does
not prove any timing or native behavior on Sven's Mac.

## Candidate and exact composition

Fetched `main` remains `09b1c998acb093f4d905d5ef844c80136ea987f6`.
Its `GeneralPage` matches the parent baseline. Ledger message
`2e068345-1d23-4150-bf23-966889c45ed9` records no other owner for this consumer.
No further ledger approval is required.

The [candidate patch](candidate.patch) is relative to `a0bde8e4` and changes only:

1. One pending boolean in `GeneralPage`.
2. Follow-up Select's `disabled` prop.
3. Its existing save callback, with `try/finally` to clear pending on every settlement.

The candidate retains the existing `false` refresh suppression, successful
refresh event, and rejection propagation. It adds no failure notification.
This is a design adaptation to OpenConductor's existing `save` boundary,
not a claim that Conductor's mutation and OpenConductor's writer have identical
error policy. Selection defaults, availability, shared Select, persistence,
keybindings, and chat submission are unchanged.

`prepare.py` recreates SendKey's three exact replacements and Follow-up's
three replacements independently against the same baseline. It checks that
both composition orders produce identical bytes and that their changed line
intervals do not intersect. It also checks the complete `SendKeyRow` tail is
unchanged in the composed candidate. Context lines in the patches can be nearby;
the changed intervals, not patch context, define this comparison.

No product source was overwritten. The full candidate is kept under
[candidate/GeneralPage.tsx.txt](candidate/GeneralPage.tsx.txt).
The old parent evidence manifest, `a0bde8e4`, AutoRun, Add/Cancel, SendKey, and
Graphite packets remain unchanged. Applying this candidate would invalidate
SendKey's whole-file product hash. The old validation contract must not be used
silently on that successor. A matched serialized execution bound is still
required from sole ACC before runtime work or application for validation.

## Checks prepared, not executed

`product.test.cjs` contains nine cases. It mounts the candidate GeneralPage with
React test renderer and the real current shared controls and preference codecs.
Persistence, platform calls, and keybinding context are synthetic boundaries.
Cases cover idle, pending, resolved true and false, rejection, synchronous throw,
a later save, adjacent SendKey failure feedback, and a separate mounted page.
They inspect the rendered native select's disabled prop and refresh events.
They do not exercise operating-system input or a native process.

`reference.test.cjs` contains six cases. It executes the retained registration,
`zQt`, `Be`, observer, mutation cache, mutation core, writer relay, and retryer.
React hook storage, scheduling, garbage collection, query-client defaults,
network status, and the settings writer are synthetic. The client configuration
and settings-service method are source closure only, not executed. Cases cover
true, false, rejection, separate observers, a later selection, and invalid input.

After a matched ACC grant, the proposed commands are:

```bash
FOLLOW_UP_SOURCE=evidence/settings/follow-up-pending/baseline/GeneralPage.tsx.txt \
  node --test --test-name-pattern='Follow-up is disabled while its own save is pending' \
  evidence/settings/follow-up-pending/composition/product.test.cjs
# Expected RED before the correction. Not run.

node --test evidence/settings/follow-up-pending/composition/product.test.cjs \
  evidence/settings/follow-up-pending/composition/reference.test.cjs
# Expected GREEN on the retained candidate. Not run.
```

Typecheck must run on an actually integrated successor under its own matched
ACC bound, with the existing SendKey cases rerun on that successor too. There
is no typecheck result for this packet. There is no screenshot because no app
was launched. No native execution, installer, duplicate queue, or runner was
started. This checkpoint is not ready PR delivery.

## Static verification

The Build the Lever principle is applied through `prepare.py` and `verify.py`.
The former rebuilds the historical closure and checks exact composition.
The latter verifies its recorded hashes, ownership chain, all protected product
bytes, and both the old and new frozen evidence manifests without JavaScript.
The Test Behavior, Not Implementation principle shapes the prepared disabled,
settlement, refresh, and adjacent-feedback assertions; those remain unverified
until the tests actually execute.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 evidence/settings/follow-up-pending/composition/verify.py
```
