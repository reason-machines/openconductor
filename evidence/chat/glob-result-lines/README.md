# Glob successful-result rendered lines

Conductor Rebuild owns CHAT.GLOB-RESULT-LINE-PROJECTION. Only successful string Glob result text is changed. Provider result bytes, file actions, LS, shared RowShell, backend, Transcript, scheduling and frozen PR #847 are unchanged.

## Source and limits

BE7 supplied the complete original-byte packet directly to implementation Session 992a715e. Archive SHA256 is `991f15ebf130ccb8e705fc74f612dbb46095bd6d73b420fbced1ffbcd94165bc`, retained as attachment `e78b8633-85a2-4561-a67c-ff7181b1d9fc` in [the evidence owner Session](https://reasonmachines.com/agents/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b). Both full assets and all nine function byte spans passed independent hash and byte-offset readback here. `source.json` retains exact asset identities, offsets and limitations; `reference/` retains the bounded caller and projection functions.

Conductor 0.87.6 app/binary identity is historical retained provenance, not a fresh device read. REA evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The historical whole-renderer semantic analysis exhausted its heap. Complete retained assets, rather than an incomplete semantic graph, ground this change. No new REA invocation or gap occurred here.

The source route O1o/L1o/Qpo through hIt selects dpo for Glob. dpo sends string result content to Dki. Dki splits on newline, removes lines whose trim is empty, and maps E0o into block divs within code. E0o trims a line only when its trimmed text has no ASCII space. Lines with ASCII spaces retain the original text. Order and duplicates remain unchanged. Dki file-opening behavior is outside this task. These are retained source observations, not live Conductor runtime observations.

Current main `1d9c4027909205d1dba9006031d922a5f2f2287a` was fetched and re-read before implementation. Its Glob/LS branch passes raw output to RowShell. Adapter, reducer, view, Transcript and CSS preserve that string and use pre-wrap. Packet snapshots matched the checked main.

## Reproduction and correction

`src/features/chat/globResultLines.test.ts` mounts the actual production ConductorToolRow under real React. The actual Reason adapter, reducer and view supply toolName, rawInput and result. Only unrelated Markdown, link and backend dependencies throw if invoked. Expected strings are literals derived from the retained contract, not a copied projection helper.

Run `node --test --test-concurrency=1 src/features/chat/globResultLines.test.ts`. On unchanged main, `red.log` records eight intended Glob text failures and five passing controls. Cases cover padded paths, interior blanks, CRLF and tabs, paths with ASCII spaces, ordering and duplicates, whitespace-only results, internal tabs and literal markup. Controls cover empty, running and failed Glob, plus raw LS and Grep.

`test-freeze.sha256` was recorded before the qualified baseline. The file and inputs remain identical after correction. Run `sha256sum -c evidence/chat/glob-result-lines/test-freeze.sha256` to check this identity.

The production change applies the line projection only inside the Glob rendering branch. It introduces no shared helper or data-model transformation. Laziness Protocol kept this local; Test Behavior, Not Implementation selected mounted text and block-line assertions rather than helper-only checks.

## Verification

- PASS: unchanged fixture hash.
- PASS: `node --test --test-concurrency=1 src/features/chat/globResultLines.test.ts src/features/chat/grepResourceLabel.test.ts`, 28 tests, zero failures. `green.log` retains the output.
- PASS: `npm run typecheck`. The first 120-second attempt timed out on the saturated shared cloud host; the bounded 300-second attempt completed successfully.
- PASS: isolated cloud Chromium fixture at `/evidence/chat/glob-result-lines/browser.html`. Actual production row/adapter/view and chat CSS render synthetic results. Glob lines have computed block display, distinct vertical positions 16px apart, exact normalized text, and preserved ASCII-space padding. LS keeps its original blank lines and padding with pre-wrap. Header clicks expand the rows. `browser.png` retains the inspected screenshot.
- NOT RUN: native app launch, native side-by-side acceptance, provider execution and real file actions. No duplicate main E2E dispatch or watcher was created. Native ownership remains E1.
- PENDING at publication: all exact-head hosted checks, protected merge, consuming-main and macOS package verification. Those results belong in the PR and coordination ledger, not inferred from local tests.

For the browser replay, run `npm run dev -- --host 0.0.0.0 --port 4597 --strictPort` through the supported preview lifecycle, then open the fixture route. It does not invoke a provider.
