# Generic tool display labels

Conductor Rebuild implements `CHAT.GENERIC-TOOL-DISPLAY-LABELS` under ledger grant `f1265f7f-8e8a-40f7-af97-79c48d74d379`. This change supplies four missing literal titles. It has no material behavior or native acceptance credit.

## Scope

The only product change is four exact-name returns at the start of `mcpLabel` in `src/features/chat/conductorTools.ts`:

- `ToolSearch` returns `Search tools`, previously `Tool search`.
- `Monitor` returns `Start monitor`, previously `Monitor`.
- `mcp__conductor__GetComputerConfiguration` returns `Read computer configuration`, previously `Get computer configuration`.
- `mcp__conductor__GetComputerBuildStatus` returns `Read computer build status`, previously `Get computer build status`.

The existing helper after those returns is byte-unchanged. Generic fallback behavior, row components, shared imports, providers, and transport are outside this change.

## Retained REA evidence

Source owner `be7a40e4-7a95-4b4b-a75d-41eaf9426f8b` supplied the original `generic-tool-labels-source-be7.tar.gz`. The received 4,481,929-byte archive has SHA-256 `4f43cf2535982492d3247107c1a875950f911b1b00660818d72f9afbf046c67d`.

The packet retains Conductor 0.87.6 evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`:

- Complete renderer SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Complete companion index SHA-256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `Kzt`, renderer UTF-8 bytes `[7589311, 7589598)`, contains both special tool literals and the metadata lookup. Span SHA-256: `0463f0835043fdda51535d2f76dac792509b24fa6018ef256e0def7242cb1595`.
- `M1o`, renderer bytes `[7588634, 7588935)`, contains the two `Read computer` literals. Span SHA-256: `65f009834a69ba61b4e7be74ffcc8f726a7a03f76cebef98124040f1bd4db7b0`.
- The retained `aUt` generic row calls `Kzt` for MCP tools, `ToolSearch`, and `Monitor`. The `hIt`, `O1o`, `D1o`, `L1o`, and `Qpo` caller and registry joins establish that these names reach that row. `ski` and the companion parser joins remain outside the patch.

The packet's `verify-label-packet.py` was rerun locally and passed all 62 static byte, literal, and source-model checks. It validates 18 exact spans, nine historical source snapshots, and the 11 declared cases. This is static evidence, not execution of Conductor JavaScript. Complete proprietary assets are not committed here.

The original REA semantic renderer analysis exhausted its heap and skipped the renderer. Retained source bytes do not close that semantic-analysis gap. No fresh installed version, executable identity, or native behavior was verified.

## Current-main qualification

Fetched and read `main` at `1c8e9593099bce8ebfbc19d83052cbfd47df5ad0` on 2026-11-12. The source packet had checked historical main `d745c5259712b49f90ab47ecb2bad674a66c3c89`.

Eight of the nine current source snapshots match the packet, including `conductorTools.ts`, the producer, normalizer, reducer, view, and transcript. Only `ToolRows.tsx` differs, in the already-merged web truncation and TaskGet branches. Its current SHA-256 is `19b740a42341185c259b155ec8bf354c1afe20251bf943f14f7fac11eb427bab`. Its generic row, helper call, and imports are unchanged. Both new regression filenames were absent before this change.

## Executed regression

Checks ran serially on Reason Cloud with Node `v22.23.4`. No browser, server, provider, native app, E2E run, workflow dispatch, rerun, or package watcher was started.

The test and input files were copied unchanged from the packet and held fixed through RED and GREEN:

- `genericToolLabels.test.ts` SHA-256: `f7a5610ec93ee528a4e08dc8d8f7f6d691b1efd5dc35a8cf0166678c70f203a4`.
- `genericToolLabels.inputs.json` SHA-256: `caf2416e5abc854785cd57c5014ca906ba01f3b9448c93714462990419ea91a1`.

The test drives the actual `applyReasonPayload`, reducer, `buildRows`, and mounted React `ConductorToolRow`. It does not replace `mcpLabel` or the row selector. Unrelated Markdown, highlighting, links, and URL-opening dependencies throw if invoked.

1. Before the product patch, `node --test src/features/chat/genericToolLabels.test.ts` exited 1. All four target cases failed at the exact mounted title assertion with the previous and expected strings listed above. All seven controls passed. These were behavioral assertion failures, not setup or compilation failures.
2. After only the four returns, the identical command exited 0 with 11 tests passed, zero failed, and zero skipped. Each case checks its exact title, collapsed state, expanded state, complete unchanged input and output body, and collapse. It does not exercise a second reopen.
3. `node --test src/features/chat/conductorTools.test.ts` passed all 15 tests with zero failures or skips.
4. `npm run typecheck` passed. The serial command advanced to the build only after typecheck exited successfully.
5. `npm run build` is incomplete locally. A combined serial check timed out at 240 seconds. A subsequent isolated build timed out at 600 seconds after branding passed, TypeScript completed, and Vite transformed 4,310 modules and began rendering chunks. Neither attempt is a completed build pass.

## Remaining limits and ownership

No product screenshot exists because browser and native execution were not admitted. This change does not establish pixel parity, installed acceptance, provider integration, or material behavior parity.

Under CI cost policy #1144, heavy, macOS, native, and other manual-only workflows remain unrun. They are gaps, not passes or additional merge holds. The ready standalone PR targets `main`, and every applicable actual check on its exact head must pass before a protected merge request.

The existing ledger owner receives verification and delivery updates. This PR does not edit the shared ledger. Package followthrough remains solely with Session `992a715e-aafd-49b0-88ba-9cabca1a3126`; this publisher does not create another package watcher. Frozen #847, paused #1098, and the web #1147 work are not publication targets.
