# Remove validation stopped after unexpected GREEN assertions

Author: Conductor Rebuild.

## Observed result

Allocation `ACC_64_REMOVE4_20261113T0342` began first source work at 2026-11-13T03:47:50.175113942Z. Full source preparation and recovery took 193.707411 seconds, below the 300-second source cap. No dependency setup was needed. Qualified main was `1aa3b6814e8a45116cf2f8d562b05d747993655b`; execution head/tree were `cf1c22b683ac97f0e46b37c913284dce0fd75a24` / `c24ce4a5cb46849a44468c6bedf43bea5ddc08b2`.

All eleven retained inputs matched the sealed Remove packet after reversing only the known Reveal accessible-label prefix in memory. Actual kit blob was `c9cba9edc064e4c8a4ffc0bad4bff2e76374c04f`. No whole historical source file was installed. The frozen four-case fixture was activated verbatim and pointed to the actual own checkout kit.

Baseline RED reproduced exactly four expected missing-pending-indicator assertions (actual 0, expected 1). Its strict predeclared inspector accepted all four cases and zero skipped/cancelled/TODO cases.

The original candidate's GREEN run returned two passes and two failures. Both successful promise settlements passed the complete original assertions. Both rejection cases reached the exact error-message assertion after their pending-feedback checks. Actual text included `Error: synthetic removal failure`; the frozen expectation contained only `synthetic removal failure`. Nothing else failed in this run. There is no full GREEN credit.

No retry, adjacent run, typecheck, additional Node execution or installation followed. Product source was restored to its prior Reveal-only bytes, Remove test deactivated, and owned process groups 112 and 129 confirmed absent. Explicit release was 2026-11-13T03:51:05.930426Z, inclusive elapsed 195.755325 seconds. Complete process-tree RSS was not sampled.

## Source-based explanation and proposed reconciliation

The fixture's deferred fake rejects with a host-realm `new Error`. Its module loader evaluates product code using `runInNewContext(..., {}, ...)`, giving the product a distinct VM-realm Error constructor. The unchanged product `run` function chooses `e.message` only when `e instanceof Error`; otherwise it uses `String(e)`. The raw result is consistent with the host Error failing that cross-realm test. This mechanism is source-supported; a corrected-harness run has NOT been admitted or performed.

The minimal proposed harness-only correction is to supply the host Error constructor in the VM context (`{ Error }` instead of `{}`). Keep every original assertion, case, deferred callback, candidate patch and product error/busy/copy logic unchanged. This would make the synthetic test exception use the same Error identity as the tested product, like a normal single-realm render. Do not alter product error handling to accommodate a synthetic VM artifact or loosen the expected message.

The proposed substitution is not applied to any frozen file or active test. Original packet `6404f233`, fixture `d2b4030f`, candidate patch `16786423`, prior Reveal packets and tab8 remain unchanged. Any corrected fixture needs an explicitly accepted additive harness supplement and fresh finite admission through the same existing ACC interest. The stopped allocation has no remaining executable authority.

## Delivery boundaries

Reveal remains ready PR #1223 at remote head `f7f5decf7b2f119ee8537cf125edcf5c323c1867`, with its timing disclosure. No Remove change or failed-validation evidence was pushed into that PR. Local normal merges preserve the assigned branch; no reset, rebase, branch switch or duplicate runner was used.

Remove has no PR. Adjacent tests and typecheck were NOT_RUN in this allocation. No browser, screenshot, native, provider, credential, clipboard, URL, Rust, package build or workflow dispatch ran. Package inclusion, animation and pixel equality remain unverified with the existing release/native owners.
