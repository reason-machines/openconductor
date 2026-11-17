# Reset pending-indicator validation

Conductor Rebuild ran the original two deferred-confirmation cases on Reason Cloud under ACC's serialized execution allocation. Baseline source is main `ee120e2a0ecfd668efad398bef71f41e6d6e0047`. Candidate source is `ed5cf969eaf8830def5801e754ef6c1db859fb94`; the delivered test is an unchanged copy of the original evidence fixture, SHA-256 `548232da973839ca8a29d734d8150a8c50e294c82ecef8752649a09f1734e396`.

The behavioral run started at 2026-11-13T02:17:32.861931Z. The last build process terminated at 02:19:34.564262Z. Explicit release was recorded at 02:20:37.926961Z. Each phase ran sequentially at nice 19. The raw logs and machine-readable receipts are in [validation-raw.tar.gz](validation-raw.tar.gz).

## Executed results

- **RED reproduced:** Both cases failed specifically at `pending Reset needs a decorative 16px working indicator` against fresh-main source. No dependency or import error counted as reproduction.
- **GREEN passed:** Both identical cases passed against the candidate. They exercise deferred success and failure, disabled confirmation, shortcut suppression, reset-files payload preservation, single-flight confirmation and settlement behavior.
- **Adjacent passed:** All 17 existing focus and dismissal cases passed without modifying their fixtures.
- **Typecheck passed:** `npm run typecheck` passed with a 1536 MiB Node heap, including the unchanged delivered regression.
- **Frontend build failed:** Branding and the build's full TypeScript phase passed. Vite transformed 4321 modules, then aborted at its allocated 1536 MiB Node heap. This is a build-resource failure, not a machine-memory exhaustion finding. No retry or heap increase was performed under that grant.

Baseline and candidate used identical arguments with the source root selected by environment:

```bash
RESET_CHAT_PENDING_SOURCE_ROOT="$SOURCE" RESET_CHAT_PENDING_DEPS="$PROJECT" \
  NODE_OPTIONS=--max-old-space-size=768 \
  node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap \
  evidence/dialogs/reset-chat-pending-indicator/resetChatPendingIndicator.test.ts
```

The adjacent command was:

```bash
node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap \
  src/features/chat/resetChatFocus.test.ts src/features/chat/resetChatDismissal.test.ts
```

The approved equivalent frontend-build command was:

```bash
npm run check:branding && \
  node --max-old-space-size=1536 node_modules/typescript/bin/tsc --noEmit && \
  node --max-old-space-size=1536 node_modules/vite/bin/vite.js build
```

Package scripts and the lockfile were not changed. This command preserves the repository's branding check, full TypeScript check and Vite configuration. The repository's normal build explicitly gives Vite 4096 MiB; the lower limit was imposed by the allocation, not by a product change. Build-only continuation at the normal limit has been requested from the existing allocator.

## Preserved scope and verification limits

ConfigSync remains outside automatic test discovery and is not part of this product fix. Shared ConfirmationDialog, Modal, focus and dismissal fixtures, preferences, backend behavior and the frozen five units remain unchanged. The only product edit adds the pending indicator inside Reset's destructive button.

No browser, native app, screenshot, packaged app, provider, Rust or installer check ran. The mounted tests do not load CSS and do not prove size, layout, animation or pixel parity with Conductor's working-loader sprite. The seven retained real-app REA spans remain the source evidence, not a claim of current native observation.

The recorded 1,850,164 KiB child maxRSS is partial cumulative child accounting, not an exhaustive process-tree memory bound. All owned phase groups were stopped and immediate children reaped. No validation job remains active from this allocation.
