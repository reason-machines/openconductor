# Rename branch preference during a pending workspace rename

Conductor Rebuild fixes only the pending eligibility of **Also rename branch** in `RenameWorkspaceDialog`. A valid branch remains editable while either rename request is pending. The accepted request still uses its submit-time branch choice. A later toggle changes the remembered preference, not the request already in progress.

## Source qualification

The assigned branch consumed fetched main `7d5c13c394e5599c32dd9678625202911f74ebf7` with a non-destructive merge. Reconciled HEAD `37d0deee1d4538f114523f8f23de2c489d5a1932` contained that main and had an identical tree before edits. All 13 scoped product, caller, model, neighboring test, package, and lock identities matched the reconciliation receipt immediately before execution.

The retained Conductor 0.87.6 REA source archive has SHA256 `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`. Both whole assets and all 37 exact spans passed byte and hash verification. The immutable contract's 61 manifest entries and archive identities also passed. Original JavaScript was read as data, never executed.

- Renderer SHA256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Companion index SHA256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Complete `Sya` span: renderer UTF-8 half-open offsets `[11050953, 11054212)`, SHA256 `386b7a5a762fc5650d92c93ac2065b18b5c93d380e29829c3c31399fd761cbf6`.
- Frozen contract archive SHA256: `90eae923d0379bb1ceb332cbf3a4575e742529ae0226b62545d4d32cd6e14069`.

The retained `Sya` checkbox does not include mutation-pending in its eligibility. Its OK button separately checks both mutations. The complete checkbox wrapper, native button props, context defaults, and inspected mount ancestors do not add a pending lock. Both asynchronous closures preserve the accepted branch choice across the record rename's await. These are retained-source findings, not observations of the current installed renderer.

The production fix removes only `|| pending` from the checkbox's disabled expression. Whole-file comparison passed against the qualified baseline plus that exact replacement. Submit capture, branch eligibility, primary action, Enter guard, empty-name handling, error handling, and immediate preference persistence are unchanged. No existing neighboring test or package file changed. The unrelated GitHub NAME fixture was not staged or modified.

## Frozen mounted regression

The four-case fixture was copied unchanged to `src/components/renameWorkspacePendingBranch.test.ts`. Its SHA256 is `309953c54b3156f609901d40266f6baf6ba4e8b6068ba44e3973ae204c071e71`, identical before RED and after GREEN. Test-first local commit `8667881a58a3372a772c644f7e388afd89d6dbea` precedes the product fix.

The fixture mounts the actual React component and rename model. Deferred synthetic backend requests and localStorage isolate external effects. DialogFrame and the icon are stubbed. The checks exercise the actual checkbox props and handlers, preference values, request payloads, dispatches, close count, and primary and Enter guards. They do not drive native controls or inspect pixels.

The cases cover:

1. A captured false choice toggled true during the record request persists true but does not add a branch request.
2. A captured true choice toggled false during the record request persists false but retains the original branch request.
3. A checkbox toggle during the branch request leaves the accepted payload and completion unchanged.
4. Empty and detached branches remain disabled before and during the record request, with no branch request.

## Actual execution

All commands ran once per admitted stage, serially in the foreground on Cloud computer 352, UUID `00637189-5c55-416e-b457-ed7419fb739a`. Each used `NODE_OPTIONS=--max-old-space-size=768`, `nice -n19`, and the stated timeout with a five-second kill grace period. No command was retried.

The two consecutive five-second preflight intervals showed 98.80% and 99.40% CPU idle, with 0.00% and 0.05% iowait. Four CPUs were visible. Minimum available memory was 28,793,704 KiB and free home disk was 27,781,197,824 bytes. The process census covered only the sandbox namespace, not the host.

### Install passed

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 180s npm ci --ignore-scripts --no-audit --no-fund
```

At 2026-11-12 12:31:31–12:31:37 UTC, exit 0. Installed React, React DOM, and react-test-renderer each reported version 18.3.1 through their package metadata. Package and lock hashes matched before RED. [Install log](install.txt).

### RED reproduced the intended failure

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 60s node --test --test-reporter=tap src/components/renameWorkspacePendingBranch.test.ts
```

At 12:32:09–12:32:10 UTC, exit 1. Exactly three tests failed with `an eligible branch checkbox must remain editable while rename is pending`. The empty and detached branch control passed. There were no setup failures, skips, cancellations, timeouts, or resource failures. [RED log](red.tap).

### Identical GREEN passed

The same command and fixture bytes ran at 12:32:39 UTC after the single production change. Exit 0, all four tests passed, with no skips or cancellations. The successful run exercised preference timing, captured request identity, repeated Enter suppression, and completion behavior for the stated inputs. [GREEN log](green.tap).

### Neighboring checks passed

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 60s node --test --test-reporter=tap src/state/workspaceRename.test.ts src/state/workspaceRenameUnicode.test.ts src/workspace/rename.test.ts
```

At 12:32:52–12:32:53 UTC, exit 0. All 17 tests passed, with no skips or cancellations. All three files remained byte-identical to the source pins. [Adjacent log](adjacent.tap).

The runtime slot was explicitly released at `2026-11-12T12:33:13.940422+00:00`. No own Node, npm, test, build, server, or watch jobs remained visible in the sandbox process census. [Timestamped receipts and log hashes](terminal-release.json).

## Verification limits

Local typecheck, lint, build, browser, preview, native app, real provider, package, workflow dispatch, extra tests, and watch were not run. No screenshot exists because browser and native execution were outside this admission. The mounted regression is not native appearance, keyboard routing, or side-by-side parity evidence.

Current installed Conductor renderer equality remains unverified. Historical REA semantic analysis exhausted its heap; earlier schema and decoder attempts timed out at 60 seconds. Those operations were not retried.

This change does not alter or prove inclusion in the fixed #992 package cut. No release or deployment is claimed. Delivery is a ready standalone PR against main on the same assigned branch. Every enabled exact-head check must pass before the supported merge request. Skipped and manual-only jobs are not passing checks.
