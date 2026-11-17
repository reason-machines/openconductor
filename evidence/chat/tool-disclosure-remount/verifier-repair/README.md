# Historical baseline verifier classifier repair

Conductor Rebuild reproduced the unchanged verifier at current main
`da5d179229db0ed3333b98235310928038bd2a26` on Reason Cloud. The exact command
below failed with `StopIteration` at line 36 before archive comparisons.
Original verifier SHA-256: `f055931a67c32b31d150744d59a5466b3c908a4ea6f371845529170bf4600515`.

```bash
python3 evidence/chat/tool-disclosure-remount/verify_baseline_root.py
python3 -m unittest discover -s evidence/chat/tool-disclosure-remount -p test_verify_baseline_root.py -v
```

`baseline.stderr.txt` records the original failure (exit 1); its stdout was
empty. `tests-red.txt.gz` retains the new tests before the repair: 11 setup
errors from that same `StopIteration`, not behavioral assertion failures.
`tests-green.txt` records all 11 tests passing after the repair. `green.json`
is the direct unchanged-command verifier result against the existing archive;
its `checked_main` identifies the checkout parent with the verifier patch
uncommitted at capture time, not an assertion that main already had the fix.

## Narrow fix and negative controls

The pinned loader policy includes four decorative entries naming three absent
historical classifiers: `ComposerAttachmentChip` (twice), `LinkIssueDialog`,
and `WorkspaceFileView`. These conservative classifiers are not historical
source imports or host bootstrap targets. Only those exact three decorative
keys may be absent. Unknown decorative keys still fail. A present classifier
still resolves normally. Required imports, overrides, pinned sources and host
entry points always resolve strictly, even when they name a known classifier.
Errors identify the missing historical target instead of raising `StopIteration`.

Tests cover all three known classifiers as missing imports; missing pinned,
override and host targets; an import required by a host; an unknown decorative
key; all four existing resolution forms; present-classifier resolution; and
removal of the real historical host target `src/features/pr/prSettings.ts`.
The integration test invokes the actual CLI and compares every frozen-fixture
file before and after, without rewriting any of them.

## Preserved evidence and limits

The verifier passes against the existing 132 source pins, 82 resolver leaves,
214 archived files, eight direct host entries and five frozen helpers. The
compressed archive remains SHA-256
`1a18371ad906ba32de960e832646939e4d6d7005d3ad18f84248cd8a99bed4dd`.
No archive regeneration, fixture/policy/pin/scenario changes or product edits.
`--write-snapshot` remains available but was not invoked for this repair.

Local execution was Python source-only tooling. Product/reference JavaScript,
mounted behavioral replay, typecheck/build, REA, browser/native acceptance,
package installation, provider/PTY work and runtime dispatch were not run.
No screenshot: this change has no visible product UI. Hosted automatic PR
workflows are separate checks, not native or side-by-side parity evidence.
Existing package/native owners and the blocked `STATIC-CAPTURE-03` contract
are unchanged. This tooling-only repair needs no product release.
