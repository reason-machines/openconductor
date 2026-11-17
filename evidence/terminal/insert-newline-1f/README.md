# Insert newline sends literal LF

Conductor Rebuild, terminal lease `TERMINAL-INSERT-NEWLINE-LF`, Session `1f14fa82-4ec3-41fc-b085-32ec441b4228`.

## Reference and fresh-main comparison

Checked default-branch head `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee` on 2026-11-17. The three affected terminal source/test files are identical between that commit and the preceding local checkout; main was merged locally before editing. No `session.ts`, shortcut registry, native, split-pane, provider, or cloud-UI change is included.

The retained real-Conductor REA acquisition is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its [existing manifest](../clear-redraw-1f/source/reference.json) identifies:

- Archive `bfa06ee0-799f-47fe-9edc-73997c70a340`, SHA-256 `d0d8e4b9b20c5150f30f5edff149bfc25f3074da5a1a66357b1caaf1ef0033ab`.
- Complete renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Complete index `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Complete renderer `$wa`, UTF-8 bytes `[11158521,11160762)`, SHA-256 `b30f983732154a396d671f194c17d660c080ae113e430c1baf5d0b089f4ab089`.

All 14 retained span hashes were revalidated in this pass. The complete original assets are not present in this checkout and were **not** rehashed or re-extracted; their identities above come from the retained manifest. The reference JavaScript was read as inert data, never evaluated. No new REA acquisition was attempted or new REA failure encountered; earlier extraction limits remain those documented in the original packet.

In `$wa`, resolving `terminal.insertNewline` calls `r` with a template literal containing exactly one LF byte (`0a`). This branch precedes the normal-versus-alternate buffer guard. Complete `eSa` supplies `writeInput:se`, whose callback forwards the same argument through `qc.write(Q,Ye)`. The manifest's retained import/export joins identify that runtime with `$kt`/`V9`. `V9.write(e)` guards running/input-enabled state and sends `e` unchanged to `backendSession.write`. Complete local adapter `ySt.write(e)` sends `data:e` to `pty_write` for its own PTY ID. Nothing in this retained chain inserts Escape or Return. [The verifier](verify_source.py) checks the retained hashes and these exact byte fragments without evaluating them.

At the checked main, `terminalCommandFor` resolves Shift+Enter to the same command, but `LINE_EDIT_BYTES` contains Escape+Return (`1b0d`). `session.ts`'s installed callback calls `runTerminalCommand`, which forwards that map value through guarded `writeInput` to `ptyWrite`. The correction changes only that value to LF. Existing direct and alternate-screen fixture expectations were independently contradicted by the retained reference bytes; they are corrected to LF, not loosened or removed.

## Reproduced RED, unchanged-fixture GREEN

On this Session's Reason cloud computer, with existing Node v22.23.4 and no dependency installation:

```bash
node --experimental-strip-types --test src/features/terminal/shortcuts.test.ts
```

- **RED (exit 1):** after correcting only the fixture's expected byte to the retained LF, but before touching production, 3 tests passed and 1 failed: `'\x1B\r' !== '\n'`. [Complete log](red.tap).
- **GREEN (exit 0):** after the one-line production correction, the same fixture and command passed 4/4, no skips or cancellations. [Complete log](green.tap). [Fixture hashes](fixture.sha256) identify both corrected test files; neither changed between these runs.
- **Reference integrity passed:** `python3 evidence/terminal/insert-newline-1f/verify_source.py`, 14 retained-span hashes and exact literal-LF/caller/transport fragments.
- **Color check passed:** `node scripts/check-colors.mjs src/features/terminal/shortcuts.ts src/features/terminal/shortcuts.test.ts src/features/terminal/alternateLineEdit.test.ts`, no violations in 3 files.
- **Diff check passed:** `git diff --check`.
- **Broader local command partial/failed (exit 1):** `node --experimental-strip-types --test src/keybindings/*.test.ts src/features/terminal/shortcuts.test.ts` produced 86 passes and 4 test-file loading failures. `editor.test.ts` and `help.test.ts` lack `fuzzysort`; `focusScope.test.ts` lacks `react`; `workspaceRunClose.test.ts` lacks `typescript`. [Complete compressed log](focused.tap.gz). These are observed absent-dependency failures, not a green suite or a claimed behavioral cause. Stored logs have trailing whitespace removed; [raw log hashes](log-hashes.json) preserve their original identities.

The direct test exercises the production shortcut resolver and byte map, not an actual PTY. Existing `alternateLineEdit.test.ts` exercises the installed `session.ts` key callback and PTY-request boundary for alternate modes 47, 1047 and 1049; those three expected bytes are now LF. That integrated suite is **NOT_RUN locally** because TypeScript/xterm/React dependencies are absent and installs are excluded. Ordinary automatic source CI runs it with the full suite; all exact-head workflows must pass before merge. No workflow was dispatched manually.

## Limits

No app, native/Mac, real PTY, shell, provider, browser, screenshot, build, full typecheck, installation or new runtime admission was run locally. This establishes a source/request-byte correction, not native, visual or end-to-end parity. No screenshot exists because this pass tests source-level byte dispatch only and native execution is excluded. `nav.splitTab` remains evidence-blocked and untouched. The four pre-existing generated parity-report edits were preserved separately, not included in this change. Documentation-only PR #1351 is not counted as application parity progress.
