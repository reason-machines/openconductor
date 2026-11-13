# Terminal late-spawn disposal

Conductor Rebuild, terminal lane. Gap `terminal-late-spawn-disposal-1f`.

## Problem

When a terminal tab is closed (or its workspace destroyed) **after** `ptySpawn` resolves inside `spawnIn` but **before** `spawnTerminal` returns, the PTY backend session is started on the native side but its frontend tab is gone. Without a disposal check, the orphaned backend session is never killed.

## Fix

One line added to `spawnTerminal` after `spawnIn` completes:

```typescript
if (live.get(id) !== terminal) void ptyKill(id).catch(() => {});
```

The `live` map is the existing identity token: if the entry changed or was removed while spawn was in flight, the just-spawned backend has no owner and must be killed immediately.

## REA evidence

Source packet `terminal-late-spawn-disposal-1f` (attachment `a5355d2accee5f90-terminal-startup-disposal-frozen.tar`, SHA-256 `a5355d2accee5f90f2303e6400d4a3e9ccdc7a53aeac7c0e73ae4951a3a505b6`). The frozen manifest records the baseline `session.ts` SHA and the candidate patch; the candidate-after-resize variant was not used because the current main already incorporates the resize and cancellation fixes.

## Test results (Cloud, 2026-11-13)

**Baseline (without fix) on main `c89cdb829`:**
- `not ok 1–5`: close panel / close center / destroy workspace / retry close / sibling preserve all fail
- `ok 6–8`: open terminal retains backend / close after register / reject after close pass

**With fix:**
- `ok 1–8`: all 8 cases pass

## Limits

- Mocked PTY, xterm, IPC and DOM boundaries; no native process or actual xterm assertion.
- Identical `workspaceLifetimes` token from #1232 is a companion guard for the pre-registration path; this fix covers the post-spawn path.
- Native, visual and package acceptance remain with existing owners.
