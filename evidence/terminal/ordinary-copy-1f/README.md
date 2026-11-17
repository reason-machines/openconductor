# Ordinary terminal clipboard whitespace

Conductor Rebuild, Terminal/scripts lane. Candidate `ORDINARY-TERMINAL-COPY-WHITESPACE-1F`.

## Correction

On fresh main `217498aae38dfd63b97919b1a0ab4097462c691e`, ordinary-terminal selections ending in spaces before later text are copied unchanged. The retained Conductor terminal factory instead trims only trailing spaces and tabs on each selected line. This is distinct from the already-shipped Run/setup `ScriptOutput` correction.

The product change is eleven added lines in `session.ts`: register a copy listener once, immediately after a successful xterm open; retain it across warm detach/reattach; remove the captured listener before terminal disposal. The callback follows the existing `ScriptOutput` idiom without modifying that component. Leading/internal spaces and selected blank lines remain intact. A collapsed selection leaves copy alone. No input/output/Find/reset, selection lifetime, shell, dependency, native command, or shortcut behavior changes.

## Original-app source closure

The retained real-app REA parent is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Complete renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. No reference JavaScript was evaluated and no new reference acquisition ran.

[Qualification identities](qualification.json) bind ten exact UTF-8 byte ranges and hashes to that original asset:

1. `lSa` selects ordinary `eSa` for an interactive terminal surface.
2. `eSa` passes its surface ID as `terminalKey` to `w9e`.
3. `w9e` calls `dno`, whose `uno` path reuses a live terminal or calls `cno` to create one through `lno`.
4. `lno` opens the terminal, then registers a `copy` handler on its element. A nonempty selection cancels the default action and sets `text/plain` through `t9s`.
5. `t9s` splits on newline, removes trailing spaces/tabs per line, and rejoins. It does not trim the complete selection.
6. `uVn` warm detachment removes the wrapper but retains the listener. `W5e` final disposal removes the exact `copyHandler` before disposing the terminal. Its retained span also contains the adjacent registration call.

These complete ordinary-terminal caller spans close the gap that Run-only `rSa/iSa` evidence could not establish for ordinary Add-to-chat. This correction does not use, remove, or reopen ordinary Add-to-chat behavior.

## Frozen regression and results

[New regression](../../../src/features/terminal/ordinaryCopy.test.ts) calls the actual session's `openTab`, `attachTab`, detach, event routing and disposal. Installed xterm `BufferLine`, `Buffer`, `SelectionService.selectionText`, and native `copyHandler` produce selections and the baseline clipboard payload. Event targets, terminal rendering, observers, font/storage and PTY boundaries are substituted. The expected whitespace outputs are literal fixture assertions grounded in the reference source, not an evaluated translation of vendor code.

- Original frozen v1 fixture: `da3e5f06bbf6347fab42c5725b859bcc6f7c8d02402c341bc63d22a0a17b3ccd`.
- Only the dynamic loader's `Object.hasOwn` spelling changed to `Object.prototype.hasOwnProperty.call` for the repository's ES2021 library. All eleven test bodies and assertions are byte-identical. Both fixture versions and complete baseline receipts are retained.
- Unchanged baseline v1: **5 passes / 6 intended assertion failures**.
- Corrected baseline v2: **5 passes / the same 6 intended assertion failures**. No setup/loader failures.
- Byte-identical v2 after the product patch: **11/11 passed**, no skips.
- Focused attachment ownership, nonrunning input, startup disposal, appearance refresh, clear/redraw, cursor, and ordinary/Run clipboard checks: **83/83 passed**, no skips.
- Full typecheck: **passed**, normal scheduling priority, 157.264 seconds. The preceding nice-19 invocation timed out after 240 seconds without diagnostics; that is not a passing compiler result and its receipt is retained.
- Color lint: **passed**, six test cases and the full source scan.
- Full local build: **partial**, exit 124 after 300 seconds. Branding and typechecking passed; Vite began transformation but did not finish. No local full-build retry was launched. The shared four-vCPU machine was heavily contended; this does not establish a product build defect or a successful bundle.
- Diff and original/source/fixture/receipt integrity checks: **passed**.

[Recorded commands and exit states](qualification.json), [raw-receipt hashes](receipt-files.json), [source check](source-check.json), and [exact product patch](copy.patch) are retained. TAP receipts are gzip-compressed without changing their original bytes. `/usr/bin/time` was unavailable (exit 127 before invoking the compiler); the subsequent measured commands use Bash's `time` keyword instead.

Replay the current fixture with the repository's installed dependencies:

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/features/terminal/ordinaryCopy.test.ts
```

The qualification's first paired runs used isolated exact `typescript@5.9.3` and `@xterm/xterm@6.0.0` dependencies through `ORDINARY_COPY_DEPS`. The focused current-branch run used ordinary `npm ci --ignore-scripts` dependencies. No application manifest or lockfile changed.

Verify the self-contained proof, optionally supplying the original full renderer for the complete byte-range comparison:

```bash
python3 evidence/terminal/ordinary-copy-1f/verify-source.py --green \
  --reference-renderer /path/to/retained/renderApp-D_fmY7hW.js
```

Fresh main `2ada6e3e186391695cae1ce5694ac251a6323079` was fetched and merged before publication. The baseline session, existing Run-copy fixture and package manifests/lockfile are unchanged. Local behavioral/compiler receipts exercised the earlier baseline with this patch; exact-head hosted checks cover the integrated publication.

## Acceptance limits

System clipboard, native/browser/xterm rendering, real-process/PTY/provider and packaged/installed-build acceptance were **not run**. There is no product screenshot: this patch changes clipboard data, not rendered UI, and the existing sole native/runtime/package owners retain acceptance custody. A report page or headless EventTarget receipt is not a native clipboard parity claim.

No new REA operation, acquisition, runtime/native/browser/package dispatch, watcher or cloud-product feature. The historical whole-renderer semantic-analysis heap limitation was not retried; no new REA gap occurred. Exact-head hosted workflows remain the merge gate; local Vite completion and installed acceptance are not claimed.
