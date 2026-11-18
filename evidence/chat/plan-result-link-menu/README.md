# Plan-result link context menu

Conductor Rebuild changes only the plan Markdown caller in `ToolRows.tsx`: pass the existing `LinkWithMenu` component. No shared Markdown, menu, notification, opener, provider, or secondary subagent implementation changes.

## Reference and current-main binding

[Retained REA source](source.json) records receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`, both original asset hashes, and twenty complete attributed source spans. The normal plan producer reaches `gpo(input.plan) -> eee -> xS/Yuo -> pEi -> cEi -> EQ`; ordinary HTTP(S) links acquire the existing “Copy link address” menu. The earlier semantic REA pass exhausted its heap and skipped this renderer: this is retained extracted real-app source, not a new native or semantic observation.

[Delivery binding](delivery-binding.json) verifies the ten existing source/package/lock inputs against fetched main `8f0f8707a529e17937cd8e9447b8b769b6bc5e21`. The initially published permanent test was byte-identical to the frozen RED/GREEN fixture (SHA-256 `5cf6a425ac7dc485bf22278af2d0b3d06870d8c717ecc965dc0d73c4db42cd75`). The permanent test now includes only the explicit TypeScript receiver annotation documented below; all frozen execution inputs remain unchanged. The only product delta is `Link={LinkWithMenu}` on the plan Markdown.

`frozen-request.json`, `green-request.json`, and `source.json` are immutable historical requests/source qualification; their preparation-time UNRUN labels are not current results. Actual observations are in the execution receipts and raw TAP below. Historical RSS estimates in the original request were not measurements or aggregate limits; the execution bound was 768 MiB old-space **per Node process**, not a process-group RSS ceiling.

## Reproduction and identical GREEN

Both phases executed the identical command in the owned, pinned runtime:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 src/features/chat/planResultLinkMenu.test.ts
```

- **RED reproduced:** exit 1, five intended `PLAN_RESULT_LINK_MUST_EXPOSE_CUSTOM_MENU` failures (`onContextMenu` was undefined), six passing controls. No setup errors, timeouts, cancellations or skips. [Receipt](runtime/red-result.json), [raw TAP, gzip](runtime/red-output.tap.gz).
- **GREEN passed:** exit 0, eleven passed, zero failures, cancellations, skips or todos. Run 2026-11-18 01:27:31.737920Z–01:27:33.742066Z; actual cleanup/release 01:27:33.745273Z. [Receipt](runtime/green-result.json), [raw TAP](runtime/green-output.tap).
- Both phases verified all eleven frozen input identities and ten retained dependency identities before and after. The GREEN phase substitutes only the admitted one-line `ToolRows.tsx` candidate. The supervisor reaped its child, observed no owned process-group survivors, and released within its 95-second foreground envelope. No retries, separate Node probe, dependency reinstall, build, browser or native execution occurred in GREEN.
- **Permanent port:** `src/features/chat/planResultLinkMenu.test.ts` preserves every assertion, adapter, import and case body. Its sole later correction is the erased receiver annotation below. Mandatory hosted frontend CI runs it with all adjacent suites, full typecheck and build; the local fixture's transpile diagnostics alone are not a full typecheck. Hosted results are reported on the PR, not presumed here.

## Hosted TypeScript correction

The first hosted frontend job on head `ac5eccdc76ad6de95fec830316a8d18cb55df5c5` failed `npm run typecheck` with TS2683 at the test's line 112: the `this` receiver in `async menu(anchor = this.anchors()[0]!)` lacked an explicit type. Unit tests and build did not run in that failed job; Evidence tools compile passed. [Failure and correction receipt](runtime/ci-typecheck-correction.json).

The permanent test adds only `this: { anchors: () => Node[] }, ` before `anchor`. This is a TypeScript-only receiver annotation, not a runtime argument. Removing that exact annotation from the permanent source recovers the original frozen fixture byte for byte, including SHA-256 `5cf6a425ac7dc485bf22278af2d0b3d06870d8c717ecc965dc0d73c4db42cd75`. No assertion, default expression, adapter, case, product code, historical request or RED/GREEN receipt changed. This source comparison does not claim a new execution; the corrected permanent port still needs hosted CI. No extra local Node, typecheck, build or install ran for this correction.

## What the eleven cases prove

The five formerly failing cases now invoke the production `LinkWithMenu.onContextMenu` closure, assert prevention and menu coordinates/label/item text, select the adapted menu item, and invoke the real copy-selection closure:

- Exact HTTP and HTTPS address copying, including query and fragment; success notification callback asserted.
- Inline-code URL copying through the same menu.
- Rejected clipboard adapter produces the existing error notification without navigation.
- Updated plan text survives collapse/reopen and copies the current address, not flattened or structured result fallback text.

The six controls preserve four ordinary/modified anchor click callbacks without interception, the actual workspace-file button callback and exact path, exact plan-copy payload plus propagation and recorded 2000 ms timer, running/error input selection and disclosure (two cases), and empty-plan gating. The timer callback itself is not fired. RED's five target cases stop before any menu callback is invoked; they must not be described as successful copy attempts.

## Evidence limits

Complete production row and link-menu modules, real React state, and the real Markdown/remark pipeline execute. The menu portal, clipboard/backend host boundaries and icon presentation are adapters. The full transcript notification root, real DOM/mouse dispatch, OS clipboard and native/system URL opening are **not exercised**; native opening is an unchanged contract. The existing plan has one Markdown pipeline, so this does not manufacture a default/tufte visual matrix or prove CSS parity. Plan approval/provider execution and the secondary subagent-forwarding candidate are out of scope.

No screenshot or recording is attached: browser/native/package execution remains assigned to the existing sole E1 owner, and this unit did not dispatch competing native work. Packaging, installed-app containment and native behavior remain separate acceptance work owned by the parent Session and sole E1 lane.
