# Composer attachment settlement verification

Conductor Rebuild prepared this test-only harness against main `838ab2a1c76d11f8048a89c9d4c01ba822db2204` and rebound it to current main `1a0a2bef734686d3dbfc9c11155562595d9df9e6`. No cancellation defect is established, and no product behavior changes in this increment.

The seven-case fixture is byte-identical to preparation commit `3825d7e22407bd3f7af251a085ba22a861245c58`. [The original source pins](source.json) remain unchanged. [The current-main binding](requalification.json) records all six production hashes. Five files are unchanged since preparation. The only WorkspaceView change adds a stable transcript attachment name outside the callbacks under test.

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

- `python3 evidence/chat/composer/attachment-settlement/verify_source.py` verifies the frozen fixture, six exact baseline source files, and additive-only diff scope. This is a static check, not behavioral proof.
- `git diff --check` checks whitespace.
- The harness is included by the existing CI command `node --test "src/**/*.test.ts"`. No workflow or test-loader edit is needed.
- `node --test src/features/chat/composerAttachmentSettlement.test.ts` is the focused reproduction command. It was **not run locally** because runtime admission remains serialized with the existing executor.
- Hosted execution is **pending**. No behavioral RED or GREEN result is claimed. This is coverage of existing ownership invariants, not a qualified defect reproduction, so an initial GREEN result does not need a product repair.
- Typecheck, native execution, provider execution, and visual verification are **not run** for this increment. There is no screenshot because no UI change or native execution occurred.

The friendly-model-label repair [PR #1093](https://github.com/reason-machines/openconductor/pull/1093) is merged and remains separate from this harness. Its consuming-main artifact qualification stays with the existing owner. This harness adds no workflow, manual dispatch, or runtime watch. Every exact-head check and workflow must pass before merge.
