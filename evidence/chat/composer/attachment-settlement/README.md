# Composer attachment settlement verification

Conductor Rebuild prepared this test-only harness against main `838ab2a1c76d11f8048a89c9d4c01ba822db2204` and rebound it to current main `1a0a2bef734686d3dbfc9c11155562595d9df9e6`. No cancellation defect is established, and no product behavior changes in this increment.

The original seven-case fixture is retained byte-for-byte at published commit `d160e6525ccca2bfd23708fb88270e9b44cca470` with SHA-256 `75e243c4dfc9900a8385c76c205dbe4ad532a473b9ef497cc54f9af889f3b7d2`. Version 2 changes only the loader. Version 3 adds the missing captured `chatId` port and waits for the existing persistence queue before reading with an independent store instance. Every scenario body and assertion remains unchanged. [The original source pins](source.json) remain unchanged. [The current-main binding](requalification.json) records all six production hashes. All six files are unchanged at checked default head `167492e56dbbb90850efbadf1db2848dae7622f2`.

## Executed code and boundaries

The fixture extracts `attachFiles`, `removeAttachment`, and `onSubmit` from the production `WorkspaceView.tsx` AST. It extracts the actual Composer `onCommand` initializer, rather than copying the `/clear` handler. The actual `Composer.submit` function consumes the command and clears its text. The local replacement service and attachment IPC adapter also come from their production function declarations.

These callbacks use the imported `ComposerSession`, `composerSessionFor`, `ComposerDrafts`, and `LocalStorageClient`. Persistence crosses the existing `memoryInvoke` adapter. Native database and file IPC are simulated ports. Model preferences are fixed fixture inputs. The native database transaction, filesystem, rendered UI, providers, and Conductor itself are not executed.

Assertions read both the originating chat and its replacement or unrelated chat. They inspect serialized drafts through a new `ComposerDrafts` instance, exact attachment-removal targets, workspace-copy targets, and delivered messages. Navigation tests require one successful subsequent delivery, so a harness that suppresses every send cannot pass.

## Four scenario groups

1. **Remove A while B is pending.** Three cases cover Claude read, Reason read, and Reason write. Removing the settled A must not remove B, resurrect A, or change another chat. For staged files, only A's staged path is removed.
2. **Clear while B is pending.** The local Claude read case invokes actual `Composer.submit`, its `/clear` initializer, and the actual `clearLocalChat` function. Late B settlement remains with the originating owner. Command text is cleared, and the replacement draft remains separate. This is an OpenConductor ownership invariant, not an assertion that Conductor retains the same hidden draft.
3. **Clear during workspace copy.** A local Claude chat loads a persisted staged attachment through the real draft decoder. Its staging bytes are explicitly seeded at the simulated native boundary. The test waits for replacement and disconnect before resolving the copy. Copy completion must not deliver to the old chat. Copied metadata loses its consumed staging marker, and the replacement remains untouched. Copy rollback is not expected. This does not claim that ordinary local file intake creates a staged attachment.
4. **Leave and remount without clear.** Two cases cover read and write. Late work must survive navigation on the same owner. Returning must permit exactly one send, while the other chat keeps its draft.

The fixture contains seven tests. Existing test files and assertions remain unchanged.

## Unsupported oracles

Ordinary local Claude file intake passes no staging writer to `session.attach`. Therefore a local `/clear` during that intake's write await cannot be manufactured as a reachable case. Reason intake has a write await, but Reason does not expose the local `/clear` replacement command. The harness does not combine those incompatible inputs.

Likewise, ordinary local intake does not create staged metadata, so it cannot alone reach `uploadToWorkspace`. The copy case explicitly names its supported persisted-staged input instead of claiming ordinary local paste parity.

Retained REA source identifies ordinary local reservation-before-upload and narrower queued-edit settlement cleanup. It does not establish a universal clear-cancels-upload contract or exact hidden-draft behavior after clear. See the [source audit](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3?page=51b247f6-f8d6-4c93-abcf-6ceb321a52d2). No fresh REA acquisition or native acceptance is claimed here.

## Verification

- `python3 evidence/chat/composer/attachment-settlement/verify_source.py` verifies the original fixture SHA, the published version-2 bytes and SHA, the exact loader and boundary-binding changes, six baseline source hashes, and additive-only diff scope. It also checks the full seven-scenario suffix byte-for-byte and rejects any scenario or assertion change. This is a static check, not behavioral proof.
- `git diff --check` checks whitespace.
- The harness is included by the existing CI command `node --test "src/**/*.test.ts"`. No workflow or shared test-loader edit is needed.
- `node --test src/features/chat/composerAttachmentSettlement.test.ts` is the focused reproduction command. It was **not run locally** because runtime admission remains serialized with the existing executor.
- Hosted baseline execution at `d160e65` **failed** in all seven cases before their assertions. [CI job 130846539083](https://github.com/reason-machines/openconductor/actions/runs/43116732422/job/130846539083) reports `SyntaxError` from the fixture's `evaluate` helper. The extracted `onCommand` expression retains `.catch((error: unknown) => ...)`, but version 1 transpiles only declarations before appending that expression to `new Function`. This is a loader failure, not behavioral RED or an established product defect.
- Version 2 transpiles declarations and the result expression together. Hosted [job 130853690906](https://github.com/reason-machines/openconductor/actions/runs/43118813322/job/130853690906) at `eadf249` **passed three cases and failed four**. Both local `/clear` cases stopped with `ReferenceError: chatId is not defined` because the fixture omitted a captured production binding. Both navigation cases passed the delivery and cleared in-memory attachment assertions, then read persisted data before the original store queue drained. This does not establish product RED. Version-2 bytes remain at published commit `eadf249b34607715aeaadde410a769719afc1fa5`, SHA-256 `f1af6f9a3edeba5c6473d0c2506fee9b0943c8350654ab62346430f0955dc7d5`.
- Version 3 adds only `chatId` to the callback ports and `await drafts.load(id)` before the existing independent `new ComposerDrafts(client).load(id)` read. The first read is ordered behind every save/clear in the original store queue. The independent read and every expected persisted value remain unchanged. No sleep, retry, suppressed error, scenario change, or product edit is added. Hosted execution is **pending**.
- Version-2 hosted typecheck **passed** in job 130853690906, step 6. Unit tests failed in step 8, so build and the later DOM checks were **not run**.
- Hosted `npm run typecheck` **passed** in [job 130846538811, step 6](https://github.com/reason-machines/openconductor/actions/runs/43116732422/job/130846538811). The later unit-test step failed. Build and subsequent steps did not run.
- Native execution, provider execution, and visual verification are **not run** for this increment. There is no screenshot because no UI change or native execution occurred.

The friendly-model-label repair [PR #1093](https://github.com/reason-machines/openconductor/pull/1093) is merged and remains separate from this harness. Its consuming-main artifact qualification stays with the existing owner. This harness adds no workflow, manual dispatch, or runtime watch. Every exact-head check and workflow must pass before merge.
