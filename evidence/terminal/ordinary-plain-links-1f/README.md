# Ordinary terminal plain-text links — Conductor Rebuild

Closes `ORDINARY-TERMINAL-PLAIN-LINK-ACTIVATION-1F` separately from encoded/OSC8 links (#1455).

## Source-backed contract

Fresh fetched main: `9f676a74b9763eacfced2489b01a81163900bed9`.
Retained real-Conductor REA parent: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

Fifteen exact parent-byte spans close `lSa → eSa → w9e → dno → uno → cno → lno`, the ordinary terminal's addon manager `eno → Kto`, and `WJs → $Js/UJs` provider activation/computation/disposal. The supplied handler is Meta-gated **direct** `vs` opening, resolved through renderer import/index export to `Rue` and `plugin:opener|open_url`. The distinct encoded `linkHandler` calls `ano` for a warning; this change preserves it byte-for-byte. Original source is inert data and is never evaluated. No new REA/native acquisition was attempted. Minified cross-chunk alias resolution remains a REA limitation, recorded with explicit parent-byte joins.

## Small implementation

- Four added lines in `session.ts`: official `WebLinksAddon` import and a single addon load with Meta-gated existing `openUrl` and handled rejection.
- Exact `@xterm/addon-web-links` **0.12.0**, one package, no transitive runtime dependencies. Existing xterm is 6.0.0. Installed API and implementation were read, and their hashes are in `integration.json`; official version-tag documentation is in the grounding note.
- New ten-case frozen regression uses the actual installed addon/provider, actual session and backend source. Terminal cells, PTY, storage, DOM and native IPC are inert edges. There is no fake URL detector/provider and no actual URL opening.
- Seventeen explicitly coordinated legacy loader ports add only an exact real-package `deps` boundary. Each archived original is reconstructed byte-for-byte after removing that one line; all original test bodies, assertions, invocation arguments and expected bytes are unchanged. No generic whitelist/proxy or native stub was added.

## Paired reproduction

Raw TAP receipts, archived loader originals, the baseline lockfile and registry metadata are stored as lossless `.gz` files (no byte normalization). Names below omit that suffix for readability; the verifier decompresses them and checks both archive and original-byte identities. This preserves raw Node assertion whitespace without adding whitespace errors to the source diff.

The fixture SHA-256 remains `f05513f25c8bd8bd2ceb137875a305d10a9f60111cf89c8cce9c06fa7aa1a0c2`.

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test src/features/terminal/ordinaryPlainLinks.test.ts
```

**Before:** 3 pass / 7 intended assertion failures, repeated on fresh main9f (`fresh-main-red.tap`). The earlier acd37606d receipt is separately preserved as `before.tap`. Failures 1–4 and 7–9 are missing-provider/precondition failures, not seven independent opener defects. The baseline no-op negative controls do not prove working modifier/protocol gating.

**After:** identical fixture, **10/10 pass** (`green.tap`). HTTP/HTTPS, localhost/punctuation, uppercase targets, modifier rejection, unsafe/malformed/bare targets, caught opener errors, reattachment, disposal, Unicode and starting-input gating are exercised with the real addon.

Legacy loader reproduction (same command before and after adding only the package boundary):

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test --test-concurrency=1 src/features/terminal/ordinaryLinks.test.ts evidence/resource-terminal-labels/regression.cjs
```

**0P/17 import-boundary failures → 17/17 pass** (`loader-before.tap`, `loader-green.tap`). No original assertions changed.

## Adjacent checks

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test --test-concurrency=1 src/features/terminal/alternateClear.test.ts src/features/terminal/alternateLineEdit.test.ts src/features/terminal/clearRedraw.test.ts src/features/terminal/cursorState.test.ts src/features/terminal/nonrunningInput.test.ts src/features/terminal/ordinaryCopy.test.ts src/features/terminal/ordinaryLinks.test.ts src/features/terminal/ordinaryThemeRefresh.test.ts src/features/terminal/resizeState.test.ts src/features/terminal/selectionTheme.test.ts src/features/terminal/sessionLineFeed.test.ts src/features/terminal/sessionUnicode.test.ts src/features/terminal/spawnFailure.test.ts src/features/terminal/startupCancellation.test.ts src/features/terminal/startupDisposal.test.ts src/features/terminal/terminalAnsiTheme.test.ts src/features/terminal/ordinaryPlainLinks.test.ts evidence/resource-terminal-labels/regression.cjs src/scripts/outputLinks.test.ts
```

**221/221 pass** (`adjacent.tap`), including encoded-link 12 and read-only ScriptOutput link 10 controls. Color lint: **6 tests and full source scan pass** (`lint-colors.log`). `git diff --check` passes.

```bash
python3 evidence/terminal/ordinary-plain-links-1f/verify.py --renderer <retained-renderer> --index <retained-index>
```

**156 inert checks pass**: full original hashes, fifteen parent spans/caller-consumer joins, frozen fixture and receipt identities, exact original-loader reconstruction, unchanged remaining session (including encoded handler), one isolated official dependency/lock entry, installed-version source identity. Full original assets are retained outside git; their exact hashes/byte offsets are in `qualification.json`. The verifier requires those original assets, not a live Conductor app.

## Acceptance boundaries

Local full typecheck/build **not run**: heavy checks remain serialized; exact-head hosted CI must pass before merging. No workflow or check was weakened.

Native pointer hit-testing, physical Command-click, actual native/default-browser delivery, real PTY/provider and packaged/installed-build acceptance remain **NOT_RUN / UNVERIFIED**. There is no product screenshot because exclusive runtime/native/E2E custody remains elsewhere; source callback/provider proof is not UI parity. No new browser/native/provider run, release dispatch or duplicate watcher was started. After merge the actual squash and these controls go to the existing ledger/release custodians for containing-package inclusion and replay.
