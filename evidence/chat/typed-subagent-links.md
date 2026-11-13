# External links in typed subagent results

Conductor Rebuild. Unit `SUBAGENT-EXTERNAL-LINKS-BE7-11`.

## Source contract

Completed ordinary `Task` and `Agent` calls with a nonempty type other than
`general-purpose` select `SubagentRow`. Its Formatted result uses `Markdown`,
but the baseline supplies neither `onOpenLink` nor `Link`. The rendered external
anchor therefore returns before preventing default and has no copy-address
context menu. Existing imports already provide the app opener and link menu.

The correction is limited to that Formatted call. It reuses the existing
`openUrl` and `LinkWithMenu` imports. Raw result text,
the result-copy button, row disclosure, untyped and general-purpose tools,
Thinking, shared Markdown, CSS, file links, and deep links are outside this change.

## Retained Conductor evidence

The source packet is attached to [the owning Session](https://reasonmachines.com/agents/029f9db7-a5bb-49eb-b01a-8f660c2b4251).
The original archive is `typed-subagent-links-source-closure.tar.gz`, 4,520,955 bytes,
SHA-256 `ab6afd8a00b6c442b68f238a884902857c299b7ee4f0dd038c96daaf9f73afe4`.
Its `packet.json` records retained REA receipt
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

Both complete decoded Conductor 0.87.6 assets were independently rehashed:

- `renderApp-D_fmY7hW.js`: 11,600,457 bytes,
  SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`: 3,493,297 bytes,
  SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The retained static route is ordinary assistant tool-use and matched result →
kind registry → `bpo` → Formatted `xS` → `pEi` → `cEi`. For an ordinary HTTP(S)
link, `cEi` supplies `z5e` inside `EQ`. `z5e` prevents default and passes the
unchanged URL through `vs`, the index export `dG` bound to `Rue`, to
`plugin:opener|open_url`. `EQ` labels its action **Copy link address**.
`CXs` leaves an ordinary URL unchanged, and `n5` passes it to clipboard helper `l1`.

Relevant UTF-8 half-open locators in the renderer include `bpo`
`[7849789,7852432)`, `xS` `[6550612,6551722)`, `cEi` `[6541795,6544749)`,
`EQ` `[6538206,6539029)`, and `z5e` `[6532394,6535885)`.
The full packet includes each literal span and its digest, plus the complete
import and index-export bindings. No extracted target code was executed.

**REA gap:** the retained semantic analysis exhausted its heap and skipped the
renderer. These decoded shipped-byte checks are not a successful fresh REA
semantic analysis or an observation of the running app.

## Integrity verification

Passed on Reason Cloud:

```bash
python3 .rea-work/typed-subagent-links/verify-packet.py
```

The standard-library verifier checked both whole original assets, 27 reference
spans, 11 source files, 26 source spans, and 56 literal join rules. This proves
static byte identity and joins, not product behavior. The packet pins main
`1ebd7e0488773fba6a4b75e57c41236fc2d0874b`. All 11 source files are byte-identical
on the refreshed implementation baseline
`12a805ed90f5aeb0d472e53a64ad6d85bf2d3479`.

The source route includes the native Claude mapper, event listener, reducer,
provider normalizer, view, grouping, visible Transcript Part, and SubagentRow.
It establishes a valid input route, not a live-provider occurrence.

## Frozen mounted regression

The test-only baseline commit is `8ea0956358903a8171c4554315dec21f680509d0`.
`src/features/chat/typedSubagentLinks.test.ts` contains 17 cases, 15,667 bytes,
SHA-256 `ba06c1eae463ab7b498aded4098603a9e78899c79592bca41c3fcb96c3169ff6`.
The submitted baseline archive is 76,353 bytes,
SHA-256 `5f9f880978ab11a41817dd33d536b899a3dd0594d6ef4e7b757320a35ad5d3d4`.

The fixture feeds assistant tool-use blocks and matched user-role result
carriers through the actual reducer, view, grouping, Transcript selection,
ConductorToolRow, Markdown, and LinkWithMenu. External opener, clipboard, menu
surfaces, and the unrelated turn footer are adapted using the existing Thinking
fixture pattern. It does not replace Markdown or manually invoke SubagentRow.

Coverage includes exact HTTP and HTTPS addresses with queries and fragments,
click prevention and opener routing, the production context-menu action,
Formatted and Raw state, updates and reopening, two-row isolation, pending and
empty results, and generic controls for missing, empty, or general-purpose types.

The original Thinking fixtures remain unchanged:

- `thinkingToolLinks.test.ts`: SHA-256
  `684234f8182d2ff548077f7d0aada5d2a2cabeff85fd6803a14874a10211f6ea`.
- `thinkingLinks.test.ts`: SHA-256
  `ccb50adaa7a013e04c869f748b3ceef286ebbe141b6eb6c069e920fbeeb50b49`.

## Behavioral baseline

The serialized baseline executor ran the frozen 17-case fixture once on an
isolated full-source snapshot of `12a805ed90f5aeb0d472e53a64ad6d85bf2d3479`.
All seven packet pins matched, and the six baseline files matched that commit.
Its command was:

```bash
NODE_OPTIONS=--max-old-space-size=384 nice -n19 timeout --kill-after=5s 90s node --test src/features/chat/typedSubagentLinks.test.ts
```

**Reproduced:** 17 tests, nine intended assertion failures and eight passing
controls, exit 1, with no skipped, cancelled, or pending tests. Four click cases
reached real anchors with the correct href, text, target, and rel, then failed
because prevention was zero instead of one. Four copy cases failed because the
real anchor lacked `onContextMenu`. The mixed Raw, update, reopening, and
isolation case reached both anchors but observed zero preventions instead of two.
There were no setup or import errors.

The actual run used Node 22.23.4 on Linux x86_64, React and test renderer 18.3.1,
and TypeScript 5.9.3 with the real Markdown pipeline. It ran from
2026-11-11T10:28:33.546380Z to 10:28:38.225459Z and released its runtime slot
at 10:28:38.239518Z. The attached unedited TAP is 12,670 bytes, SHA-256
`17e8ba77fe57438089757d3ad5e0466a479a0513ee7cca273e47fec2c103afa3`.
The final receipt is 10,096 bytes, SHA-256
`b8983eef8b412b6b67501b17665f65d12aa50956d940e510e8ec8271f1c5650f`.
Both are retained with the owning Session.

## Candidate GREEN and current-main reconciliation

After that behavioral RED, candidate commit
`0879c5f3f1c6c946d4c18bd7503af75d134fd8f6` adds `onOpenLink` and `Link` only to
SubagentRow's Formatted Markdown call. It adds no imports or dependencies and
leaves the 15,667-byte fixture and its assertions unchanged. The product patch
is 792 bytes, SHA-256
`b0d5f9c9a0156ee592c2ee8e202e535e40753a8e92bd705ac4a3fd5b59c5d1b7`.

**Passed:** the same frozen 17-case fixture ran once on the existing serialized
executor with the same immutable baseline and only that one-line correction.
All 17 cases passed, with zero failures, skips, cancellations, or pending tests.
The command was identical to the baseline command above. The original nine
behavioral failures and eight passing controls were retained, not rerun or
rewritten. The mounted anchors now prevent default, route the exact external
address through the fixture-controlled opener, and expose the production
copy-address menu action. Raw text, updates, reopening, row isolation, pending
and empty results, and generic-type controls also passed.

The GREEN run used the same Node 22.23.4 binary and qualified physical dependency
entries as the baseline. It ran from 2026-11-11T10:57:57.179285Z to
10:57:59.384520Z, then released the runtime slot at 10:57:59.480692Z.
The unedited TAP is 4,177 bytes, SHA-256
`1ad28a100c3246a8dabea298c3332ba1649df6a9d620b6fa1bcaf0a0dba29af3`.
The receipt is 11,129 bytes, SHA-256
`57c64962b8b3c6b70ebe969785771d0762f021a43068e7af6423f1324d130b78`.
The attached result archive is 56,218 bytes, SHA-256
`aba663e96fa3d2658fb918c5b549553c1738ade2cac6a3178f5ef7389ae04ac4`.
Its seven manifest entries were independently rehashed in the owning Session.

A separate source-only reconciliation against main
`5555ec597fa5d3af0311ae0094eb3134d87fbb08` passed before integration. The six
baseline source and dependency files, plus unchanged Markdown, LinkMenu,
backend, and Open in modules, matched their frozen hashes. Integrating that main
preserved the exact fixture and candidate ToolRows bytes. This comparison does
not claim the frozen runtime exercised a moving-main context. Normal hosted CI
checks the published integration.

## Verification limits

The eight controls inside the 17-case fixture passed. The separate Thinking
control command, full typecheck, and build were not run by the serialized
executor. No Node execution, dependency installation, build, browser, app launch,
or native acquisition ran in the owning source-only Session.

Native, visual, real opener, real clipboard, installed-package, and real-provider
feature acceptance remain unverified. No screenshot exists because browser and
app execution are not part of this source-only pass.
