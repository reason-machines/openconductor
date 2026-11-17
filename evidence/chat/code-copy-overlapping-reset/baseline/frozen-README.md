# Overlapping fenced-code copy resets: frozen regression

Owner: Conductor Rebuild. Candidate: `CHAT-CODE-COPY-OVERLAPPING-RESET-BE7`.

## Current state

**STATIC FIXTURE ONLY. No RED or GREEN execution has occurred.** No product code was changed. This increment freezes one actual-component regression and its retained-source attribution before requesting the serialized cheap-check slot. Production editing remains gated on an executed, qualified RED.

The preparation worktree is based on main `c22e27d48a0940c5793842cfddc023b7e5f838c5`. It is deliberately separate from the assigned checkout / historical #1466 so this unexecuted fixture does not enter an existing PR through automatic turn-end publication. No PR, publication, or merge is requested at this stage.

## Frozen identities

- Baseline fixture SHA-256: `5e99cc9f652a18249c33fbcf9e2260c7e320b6a025f44e708a9c9ecd55f6f86b`.
- Frozen fixture SHA-256: `720e650d15b131230353f0673cb307fe1a935e0d8ece4415379ef8df96de91c2`.
- Baseline product `markdown.ts` SHA-256: `06354820fa6722b771c0e626a3dffc2cee5f34f0917366ca25ec47cdddab17b4`.
- All four pre-existing test declarations and bodies remain byte-for-byte unchanged. The shared clipboard fixture now supplies one independently settled Promise per actual write request instead of reusing a single Promise. No React state, effect, callback, or reset implementation is copied into the fixture.
- Exact c22 baseline snapshots of the existing fixture, `markdown.ts`, `Transcript.tsx`, and `package.json` are retained under `baseline/`. The source manifest records every snapshot's size and digest, plus the baseline commit/size/digest of the unchanged lockfile without duplicating its 6003 lines.

## Retained REA oracle and scope

The existing complete renderer `renderApp-D_fmY7hW.js` was rehashed: **11,600,457 bytes**, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

Historical REA receipt: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Original checkpoint attachment: `4db32769-6ddc-468a-b8da-37ee7cd4cc12`, SHA-256 `5f9359889985aa5664f4f53b6b8c4f64fc9c8f9e46d42f5bcf13eccbf1c1d196`.

All nine exact half-open UTF-8 byte spans and their digests are recorded in [source-manifest.json](source-manifest.json); the literal bytes are retained under `reference/`. This is retained shipped-source evidence, not a current installed-app identity or a native behavioral observation. No new source acquisition occurred.

The bounded caller chain is `ROo → xS → pEi → dHn → VXs.code/$Xs → WJe → t0`, with `l1` as the clipboard-awaiting helper. Ordinary nonempty assistant text supplies no code override; `$Xs` selects `WJe` for ordinary non-Mermaid multiline code. `WJe` supplies trimmed text and hover styling to the real `t0` button, with no `disabled`, custom copy, tooltip, reset, or remount prop. `t0` guards disabled, not its success state. Each successful fulfillment sets success true and independently schedules false after 2000 ms; no prior timeout is cancelled in this component.

**No-tooltip/icon-only limit:** `WJe` supplies no tooltip. The retained confirmation established here is the copy/check icon state, not OpenConductor's `Copy` / `Copied` text or title. The regression uses the existing OpenConductor labels only as observations of its current success Boolean; it does not assert that those labels match Conductor.

## Actual-component regression

The existing harness loads production `Transcript`, assistant `Part`, `Markdown`, `CodeBlock`, and the actual `CopyCode` callback. Unrelated transcript branches throw. The only controlled surfaces are a VM-local clipboard Promise and deterministic timeout clock, not a browser/OS clipboard. No model of the production reset logic is used.

One new case keeps the same real ordinary fenced-code button mounted and confirms it is not disabled. It invokes that real button callback and separately fulfills the three clipboard requests at 0, 1000, and 2500 ms. React updates are flushed with the existing `act` boundary after each event.

The source-predicted observations, **not yet executed**, are:

- 0 ms fulfillment: success; 1000 ms fulfillment: remains success.
- 1999 ms: success; exactly 2000 ms: first reset clears success.
- 2500 ms fulfillment: success; 2999 ms: success.
- Exactly 3000 ms: retained second timeout clears the third success. Current effect-based main is predicted to remain `Copied` instead.
- 4499 ms: remains clear under the retained contract; exactly 4500 ms: third timeout leaves it clear and no timeouts remain.

The fixture snapshots 3000 and 4499 ms and postpones the decisive assertions until after visiting 4500 ms. Thus the expected RED still reaches the last requested boundary. It also checks all three unchanged trimmed payloads and the absence of notifier feedback. Existing rejection, single-success 1999/2000, no-notifier rejection, and plain/inline controls are untouched.

Predicted baseline outcome: four controls pass, one overlapping-success assertion fails at the captured 3000-ms state. This is a prediction, **not** a test result. A qualified RED must fail on that assertion rather than module loading, fixture compilation, component identity, or another setup error.

## Requested serialized slot (not admitted)

Run from the isolated `chat-code-copy-overlap` worktree, after dependencies are provisioned from the pinned lockfile:

```bash
timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/copyCodeFeedback.test.ts
```

The same unchanged fixture/hash and command will be used for GREEN only after qualified RED and the authorized narrow `CopyCode` scheduling change. Raw TAP, exit codes, product-before/product-after identities, and fixture digest equality must be retained.

Requested budget: one foreground Node process at a time, one CPU lane, estimated peak RSS up to 1.5 GiB with a 768-MiB V8 old-space limit (not an RSS enforcement claim), 60 seconds per check plus a 5-second termination grace, at most five minutes for the paired checks plus the gated small edit/static review. These are limits/estimates, not measured timings.

**Dependency prerequisite:** this worktree has no `node_modules`. Dependency provisioning is not included in the cheap Node timing estimate and has not run. Request allocator approval for lockfile-based provisioning or an existing verified dependency mount before admitting the check; do not silently install during the check slot.

No build, typecheck, browser, native, provider, REA, clipboard, or full-app parity run is requested by this slot. No screenshot exists because no visible application execution is admitted.

## Static validation and delivery gate

Static checks verify the complete retained parent, all nine decoded literals/ranges/digests, four c22 snapshot identities and the baseline lockfile digest, unchanged four controls, unchanged product file, changed-file scope, and whitespace. These checks do not establish a behavioral PASS.

Only after qualified RED may production changes touch `CopyCode` success/reset scheduling. Payload/rejection feedback, copy labels, context/Composer, costs, cancellation, providers, and other rows remain outside the lease. The eventual ready PR must target main, and every exact-head workflow must pass before merge. This frozen increment has no PR and no publication request.
