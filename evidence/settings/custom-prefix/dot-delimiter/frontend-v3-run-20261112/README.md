# Corrected frontend regression passed

Conductor Rebuild ran the separately admitted V3 corrective check on Cloud352 (`00637189-5c55-416e-b457-ed7419fb739a`) on 2026-11-12. The frontend is verified for the frozen inputs. **The delimiter change is not complete or mergeable: Rust still rejects a terminal dot and has not been executed or edited.**

## Source and fixture identities

An ordinary non-destructive merge incorporated main `1286465cb69763efaa1367c49fdebc88ab4da86d` on the assigned branch `reason/openconductor-notificati-c18e1b05`. All 25 containing-main source pins matched. No reset, rebase, rebind, extra checkout, or sanitizer edit occurred. GitPage still uses raw `setCustom(e.target.value)`.

[The dated source and grant receipt](ordinary-c18-v3-corrective-grant.json) records source identities, thirteen remapped manifest entries, archive identities, and the two baseline and fixed model hashes. The fixed model pair is byte-identical to milestone `4235d533bafe93fc82ebce194ce3b677ecca5b8a`:

- `model.ts`: `a1f5436fc5ccd1c426ed5d8b21ea91efff327a9aafd4c7e692864c24f9de5da7`.
- `model.test.ts`: `c580502edb0cdbc7d25712a71d57393b0a2274097b06d70fa98678a291f7f896`.
- Frozen V3 fixture: `d6c81e973d4054aead4ffb63a63b3288aebabb0c933f569e34473a823e3e98cb`, 7,142 bytes.
- Root lock: `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`.

V3 differs from preserved V2 only by replacing `Object.hasOwn(imports, name)` with `Object.prototype.hasOwnProperty.call(imports, name)`. The receiver, key, assertions, and controls are unchanged. All seven raw validator and normalized-input guards remain. The thirteen cases comprise two delimiter positives, seven raw guards, three mounted invalid controls, and one GitHub/None control.

The original NEW10, V2 source, manifests, and [V2 run including its TS2550 failure](../frontend-run-20261112/README.md) remain unchanged. Earlier source-preparation documents and manifests are immutable historical records, not the current execution status. No TypeScript configuration, dependency, or library rule changed to obtain this pass.

## Actual one-shot commands

ACC message `ed54cf3d-ac51-4181-a65f-e8418947bb40` admitted only these four foreground serial commands, each once with a 120-second cap. Existing dependencies were used. No reinstall or retry occurred.

For RED, both fixed model files were saved outside the tracked evidence, and only those two files were replaced with exact containing-main baseline bytes. The identical fixed files were restored immediately after RED in a `finally` block. Fixture and lock identities were checked before and after each phase.

```bash
timeout 120s node --test --test-concurrency=1 --test-reporter=tap src/settings/customPrefixDotDelimiterV3.test.ts
```

- **RED reproduced the defect**, 11:28:32.993506–11:28:33.801653 UTC, exit 1, 0.808 seconds. Thirteen tests ran: eleven controls passed and exactly the two intended delimiter tests failed. No skips or cancellations. [Raw RED](red.tap), [terminal receipt](red.result.json).
- **GREEN passed**, 11:28:51.208519–11:28:52.202227 UTC, exit 0, 0.994 seconds. The identical command and fixture passed all thirteen tests with no skips or cancellations. [Raw GREEN](green.tap), [terminal receipt](green.result.json).

```bash
timeout 120s node --test --test-concurrency=1 src/settings/customPrefix.test.ts src/settings/customPrefixInput.test.ts src/settings/model.test.ts
```

**Adjacent checks passed**, 11:28:52.203825–11:28:53.324659 UTC, exit 0, 1.121 seconds. All twenty-one tests passed with no skips or cancellations. The legacy pure and mounted fixtures were unchanged. [Raw adjacent output](adjacent.tap), [terminal receipt](adjacent.result.json).

```bash
timeout 120s npm run typecheck
```

**Typecheck passed**, 11:28:53.325937–11:29:10.778434 UTC, exit 0, 17.452 seconds. `tsc --noEmit` produced no diagnostics. The output includes the environment's experimental proxy-agent warning, not a TypeScript diagnostic or resource warning. [Raw typecheck output](typecheck.txt), [terminal receipt](typecheck.result.json).

No command timed out. `git diff --check` passed. At 11:29:41.240135 UTC, the scoped process scan found no own Node, npm, tsc, Cargo, rustc, or timeout job. The frontend slot was explicitly released to ACC. [Release receipt](slot-release.json).

## Limits and separate backend request

These mounted tests run production GitPage, controls, model, naming, and create-request assembly, with the existing save and username-lookup boundaries substituted. They prove the frozen frontend behavior, not backend storage acceptance, actual Git creation, installed app behavior, or native appearance.

The Rust manifest and three-case harness are unchanged. [The separate source-only backend request](backend-request.json) records hashes, cache and lock presence, requested commands and budgets. It grants no execution permission. Rust RED/GREEN remain predictions, not results.

No Rust command, application build, browser, server, native app, provider, package, workflow dispatch, or release operation ran. No screenshot exists because visible/native execution was outside this grant. The historical REA semantic-analysis gap and unavailable whole assets remain. The separate sanitizer owner and existing release-owner992 scope are unchanged. PR #1170 must not merge while the known backend mismatch remains.
