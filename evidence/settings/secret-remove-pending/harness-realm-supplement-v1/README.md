# Inactive Error-realm harness supplement

Author: Conductor Rebuild.

This supplement does not replace or mutate original Remove packet `6404f233`, its frozen fixture `d2b4030f`, candidate patch `16786423`, or the failed validation. No Node/test/typecheck/runtime was executed to prepare it.

## Exact change

In the module loader only, change the VM context argument from `{}` to `{ Error }`. This supplies the same Error constructor used by the host deferred fake and by the evaluated product's `instanceof Error` check. There are no assertion, expected-text, case, fake action, product, callback, scheduling, busy-policy or cleanup changes. The context now follows the existing pattern in `src/features/diff/commentSaveFailure.test.ts` (line 45), `src/features/terminal/spawnFailure.test.ts` (line 106), and `src/features/openIn/settingsShortcutHint.test.ts` (line 27), checked byte-identical to default-branch head `1aa3b6814e8a45116cf2f8d562b05d747993655b`.

Source explains the original run's error prefix: the host rejection used a different Error constructor from the empty VM context's built-in, so unchanged product logic selected `String(error)` rather than `.message`. Corrected behavior is a hypothesis until this supplement receives renewed admission and the same assertions pass.

## Required finite validation, existing ACC interest only

After ACC explicitly accepts this supplement, qualify current main, exact execution tree, all original eleven input pins, known qualified Reveal-only prefix, original packet/candidate/reference/protected identities, and this corrected inactive fixture's new hash. Preserve the known Reveal product/test composition without historical whole-file replacement. Activate the corrected fixture verbatim at the same actual checkout test path. Point `SECRET_REMOVE_SOURCE_FILE` at the actual matched own checkout kit, never an alternative product snapshot.

Repeat baseline RED and identical corrected-fixture GREEN once, each bounded to 90 seconds plus 5 seconds termination grace, development environment, heap768, nice19, concurrency1. Expected baseline remains all four missing-indicator ERR_ASSERTIONs (actual0/expected1); expected GREEN is four passes including the unchanged rejection-message expectations. Stop on every other failure or timeout. Apply only original retained candidate patch after qualifying RED.

Run unchanged adjacent Reveal4 + secretEditorKeyLink + kitModel once under the same Node flags/heap with 120+5 seconds; expected 13 passes, zero skips/cancellations/TODOs. Run actual checkout `npx --no-install tsc --noEmit` once with installed own compiler, heap1536 and 180+5 seconds. Reuse exact own React/renderer18.3.1 and TS5.9.3. No install unless ACC explicitly permits its one absent-dependency route.

Suggested same finite budget is inclusive1560: full source/recovery300; optional absent-root install600+5 heap1024; RED90+5/GREEN90+5/adj120+5/type180+5; cleanup90/receipts65. ACC owns the actual next token/caps; this source proposal grants none. No hidden clock restart/retry/extension. Seal predicted cases and all tested identities before Node, collect raw argv/nonsecret env/stdout/stderr/exit/counts/all phase wall timestamps, restore candidate/deactivate fixture, and explicitly release with owned jobs absent.

No native/browser/provider/credential/build/Rust/package/workflow-dispatch permission is implied. Original stopped run stays FAILED with RED4 qualified and GREEN2PASS/2FAIL; adjacent and typecheck remain NOT_RUN for that run.

Remove publication must be a separate ready PR against main after Reveal #1223 closes/merges and a supported next publication binding exists. Do not push this correction or Remove candidate into the still-open Reveal PR, stack a PR, reset/rebase, or switch branches to bypass that binding.
