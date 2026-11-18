# V3 baseline execution: qualified semantic RED

Conductor Rebuild · `DIFF-UNCOMMITTED-DISCARD-AFFORDANCE-DE6-01`

Executed once on the Reason cloud computer under the existing serialized
`SAMEDE6-RED10-V3-20261118T014655269Z` admission. No installation or treatment
was included. The actual invocation's fresh fetch resolved main to
`5100f02abdc1129050d5f020f8de552680fc2994`; all 22 source/package bindings were
identical to the original untreated inputs. Preparation had checked the earlier
`06c5fefc9a13fbae9acb743c5d4cd1d1673689eb`, not the runtime main identity.

```bash
node --experimental-strip-types --test tests/diff/uncommittedDiscardAffordance.mounted.test.mjs
```

The reviewed Python helper's CPU/nice, process-group census and single
stop/reap utilities supervised this command. No helper main/install/cleanup
entry point was invoked. Bounds: CPU0, nice10, UV1, 768-MiB heap per Node,
120-second child / 5-second TERM-KILL-reap / 130-second foreground; sampled
live-group RSS guard 2 GiB and free-disk floor 4 GiB. These are userspace
samples and termination guards, not kernel/burst/escaped-group/disk quotas.

## Actual results

- Unified row and header: both failed at the intended ordinary-Uncommitted
  visibility assertion, actual one discard button versus expected zero.
- Split row and header: the same two intended failures.
- Entire-file row and header: the same two intended failures.
- All, Uncommitted, commit and turn context-menu controls: all four passed,
  retaining their independent All-scope confirmation policy.
- All ten `finally` paths passed zero Git-discard calls, zero declared
  native/clipboard/provider-boundary calls, polling-timer release and a real
  hook read of the deterministic changed-file DTO.
- Total 10, pass 4, fail 6, skipped/cancelled/todo 0; child exit 1. This is
  semantic RED, unlike the retained v1/v2 setup/binding failures. The six
  return-to-All confirmations remain unreached because the visibility assertion
  stops each case; unchanged treatment GREEN must exercise them.

Child start `2026-11-18T01:49:14.403206Z`; child end `01:49:26.943158Z`;
actual group release `01:49:26.943792Z`. The single owned stop/reap completed
with no surviving group members and no visible own Node/npm processes.
Sampled peak group RSS 287,993,856 bytes; minimum sampled free disk
4,703,617,024 bytes. A shared-pressure alert arrived after the command returned;
these observations make no claim about current free disk or unsampled intervals.

All 38 original preservation pins, the unchanged v3 fixture/helper, installed
five-package version/resolution/SRI identities and source/package inputs passed
pre/post readback. Owned dependencies and marker remain; cache absent. No
filesystem cleanup, retry, extra unit/build/browser/native/provider run or
product treatment occurred in this phase. No GREEN, CI or PR success is claimed.

## Exact retained artifacts

The JSON files under `runtime/` are original-byte copies, not normalized
summaries. The TAP is losslessly gzip-compressed so its original diagnostic
whitespace is preserved without introducing trailing whitespace in source:

- `red10-v3.log.gz`: decompresses to the exact 6,825-byte TAP, SHA-256
  `45759cf9b6483c4b4547d259ce9a15f0631bef922e6e04c75a9a27f501dfb598`.
- `red10-v3-receipt.json`: SHA-256
  `5ce9086514e5bb49b5176831b421e3ccbd3129a85bfb4b0fc816ead93604e74e`.
- `red10-v3-classification.json`: per-case classification and reached/unreached
  controls, including the original receipt/raw identities.

Fixture SHA-256 remains
`a2aef693638daac179d28cfdce96dea63bb4022d9e06cb7e68731b732060402b`;
all ten case bodies remain
`fb7c64475dd4d41efb4722df10479321f860115f8bb4002fd064f43f418868b3`.
No retained Conductor JavaScript was executed. This mounted React test does not
prove native interaction, destructive Git behavior or side-by-side visual parity.
