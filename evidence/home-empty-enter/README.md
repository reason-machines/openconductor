# Home empty-list Enter

Unit: HOME-EMPTY-ENTER-271-04. Producer: Conductor Rebuild.

## Source qualification

The two original attachment hashes were independently checked on Reason Cloud:

- Source packet: `b8aa01b725b6f698938bcea3cc22bd923fd8f3dc14a8ea6ce1dca568ac8ab3e0`.
- Source-closure archive: `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`.

The archive's regular renderer member is 11,600,457 bytes. Its SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

[The original receipt](reference-original.json) retains all three complete source spans and their UTF-8 and UTF-16 half-open bounds. Two independent verifier invocations reproduced its SHA-256, `7445a5b570189a847ce5d418cba597963bbf8ea2e5066b4d061d650ec1e396c9`, byte for byte at main `248b6c359c830c6ac5e050721bae18e44e168068`.

[The pre-RED receipt](reference-pre-red.json) rechecks main `6ea86f222815a43ab12355eee2afbdcd981b2164`. Its SHA-256 is `f4afa4b2b5fbe557f4d6924047dab24fdce2b497eedf252652a8f15dbf16a5ff`. The component hash remains `f2cd29c810d99a0ea8cbb6fa59d09c00134e28bb2e48f6a681f1ef604e89c4b5`.

The retained source joins Home `UJo` to `KV`, then `P6` and the `Xyi` command root. `Xyi` cancels non-composing Enter before looking for a selected item. The checked OpenConductor handler returns for an empty list before reaching its Enter cancellation. This is a source mismatch, not an observed Conductor execution.

REA parent evidence: `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85c81d72254a367`. The existing semantic-analysis heap-exhaustion limitation remains. This preparation found no new REA failure and did not rerun semantic analysis.

Reproduce the source-only check with the original archive available locally:

```bash
python3 evidence/home-empty-enter/verify-source.py \
  --archive /path/to/conductor-dxe-source-closure.tar \
  --main 6ea86f222815a43ab12355eee2afbdcd981b2164 \
  --out /tmp/home-empty-enter-reference.json
```

The verifier checks archive and renderer hashes, each span hash, UTF-8 bounds, UTF-16 bounds, the source join, and the checked main handler. It never executes retained Conductor code.

## Frozen regression contract

[The frozen contract](frozen-contract.json) was written before first publication and any hosted run. Test SHA-256: `7e95c58cc197dffdf4ebe80629149d1a64209b08568050c44283ae3380ca972e`.

The four cases in [the component test](../../src/components/homeEmptyEnter.test.ts) are:

1. An empty source list cancels Enter without activation.
2. A populated list filtered to zero cancels Enter without activation.
3. A nonempty list cancels Enter and activates its selected workspace exactly once.
4. An unrelated character key on the empty list remains unprevented and dispatches no activation.

The test mounts the complete production `AllWorkspaces` under the real `KeybindingsProvider`. Provider dependencies, shortcuts, Home filtering, grouping, and selection are real. Only unrelated visual leaves, preference and status data, and the archive IPC boundary are stubbed. It calls the rendered search input's actual callback with a cancelable native `Event`. It does not extract function source, replace keyboard behavior, introduce a page wrapper, or alter shared fixtures.

This follows Test Behavior, Not Implementation: the assertions check visible rows, prevention, and externally dispatched activation rather than private handler text.

The existing automatic CI command is `node --test "src/**/*.test.ts"`. No workflow, dependency, or queue configuration changes are needed. Setup, import, or graph failures do not qualify as intended RED. Cases and assertions remain frozen after publication.

## Automatic hosted RED

[The hosted receipt](hosted-red.json) and [four-case log excerpt](hosted-red.log) record automatic CI run [43050567375, unit job 130626219598](https://github.com/reason-machines/openconductor/actions/runs/43050567375/job/130626219598) at published head `dbe165b42081dc19f620e2d084150abbd15d03ba`.

The complete suite ran 2,807 tests: 2,805 passed and exactly two failed. Both empty-source and filtered-to-zero cases reached and passed their no-activation assertions, then failed cancellation with `false !== true`. Nonempty Enter prevention/selected-row activation and the unrelated empty-list key controls both passed. This is intended component RED, not a setup, import, or graph failure. The Frontend typecheck + build job also failed at its unit-test step on the same two assertions, not at typecheck.

The log excerpt removes trailing whitespace from blank log messages only. The frozen test and contract bytes remain unchanged. The contract's `hosted_red: NOT_RUN` records the pre-publication freeze; the later hosted receipt records the actual result. No production fix preceded this RED.

## Ownership and verification limits

This increment contains tests and evidence only. Product changes are not present.

PR #1052 exclusively owns the shared `AllWorkspaces.onSearchKey` handler until its owner explicitly releases the lease after merge. An Enter-only fix requires fresh main containing #1052 and a new handler/source-mismatch check. PR #1049's provider changes and fixtures remain with their owner. Frozen header8, Prefix9, Home-list6, and Home-End7 inputs are untouched. The root retains #1041.

Source verification and static test-contract checks passed. Intended automatic hosted RED was observed as recorded above; GREEN has not been observed. No local Node, app, browser, native, build, install, hosted dispatch, rerun, or E1 execution was run. Native and visual parity, original-app acceptance, and consuming-main packaged behavior remain unverified. Unit checks alone cannot complete the rebuild.
