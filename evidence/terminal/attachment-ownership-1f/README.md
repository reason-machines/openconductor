# Terminal attachment ownership — source-only correction

Conductor Rebuild / SAME1f. Exact serialized lease: the `Live` attachment state,
`attachTab`, and `dispose` in `session.ts`; one new frozen regression; this packet.
No selection, split-pane, PTY, provider, public-API, native or workflow changes.

## Reference and current-main mismatch

Fresh main **8e1c32c3f05efc1562177ea91ad3adccc940c7fe** includes selection repair
#1386. Baseline `session.ts` SHA-256:
`1aa41588140bcfbf7a223aae21470482680a2778ba27a1a269ff667abae13a21`.

Retained real-Conductor REA `w9e → dno → uVn/W5e` carries an attachment identity
from creation to cleanup. `dno` changes `activeAttachmentId`, disconnects the old
resize observer, and appends the retained wrapper; `uVn` and `W5e` reject cleanup
whose identity no longer owns the terminal. `W5e` also releases the observer and
wrapper when destroying the terminal. The ordinary-theme-refresh packet retains
[all five exact source spans](../ordinary-theme-refresh-1f/reference/) and their
[original extraction provenance](../ordinary-theme-refresh-1f/source/source.json).

All five spans were freshly hash/length-verified. Their renderer byte ranges,
hashes, historical complete-artifact identities and REA evidence ID are retained
in [frozen.json](frozen.json), the unchanged V2 **qualification-time snapshot**.
Its read-only-audit limits describe that earlier qualification, not this repair.
The complete original assets are unavailable here for a fresh full-asset rehash;
their hashes are retained provenance only. Reference JS was read, never executed.

OpenConductor previously returned a cleanup that always removed its shared host.
A → B attachment followed by A cleanup therefore removed B, including reattachment
to the same container. The previous resize observer also remained live until its
old caller eventually cleaned up; disposal did not release attachment resources.

The correction stores the current detach-function identity and observer together.
Replacement immediately disconnects the old observer without an extra host removal.
Only the current owner may detach or refit. Disposal invokes current attachment
cleanup before disposing xterm. The selection/startup prefix is byte-preserved,
except for the new optional `Live.attachment` field.

## Reproduction and verification on Reason Cloud

- **RED reproduced:** `node --test .oc-tmp/attachment-ownership-1f/attachmentOwnership.test.mjs`
  on the fresh baseline above — **2 controls passed / 3 exact assertions failed**,
  no load failures. [Raw RED, losslessly compressed](red.tap.gz).
- **GREEN passed:** `node --test src/features/terminal/attachmentOwnership.test.mjs`
  — **5/5 passed**. [Raw GREEN](green.tap). The test is the exact V2 fixture, not
  a modified assertion set: SHA-256
  `5f29c98db7b890125d9099afd034ed457c40085540d6e9cbab0d2d995b5bf271`, 3,801 bytes.
- **Supplemental RED/GREEN:** same separate [edge fixture](ownershipEdges.test.mjs)
  on a `git show` copy of the baseline (`TERMINAL_SESSION_SOURCE=... node --test ...`)
  — **3 passed / 2 intended failures**, then **5/5 passed** on working source.
  Covers late observer delivery, idempotent detach/disposal, old cleanup after
  disposal and same-ID replacement, failed-open retry, missing terminal, and
  replacement without an explicit host removal. [Baseline, losslessly compressed](supplemental-red.tap.gz).
- **Combined GREEN passed:** `node --test src/features/terminal/attachmentOwnership.test.mjs evidence/terminal/attachment-ownership-1f/ownershipEdges.test.mjs`
  — **10/10 passed**, zero skipped. [Combined log](combined-green.tap).
- **Adjacent check PARTIAL/FAILED at dependency loading:** `node --test --test-concurrency=1 src/features/terminal/terminal.test.ts src/features/terminal/restore.test.ts src/features/terminal/tabList.test.ts src/features/terminal/shellIntegration.test.ts src/features/terminal/writeQueue.test.ts src/features/terminal/sessionLineFeed.test.ts`
  — **42 passed / 1 file-load failure**, missing existing `typescript` dependency.
  No test assertion failed. [Raw log](adjacent.tap).
- **Provenance/preservation passed:** `python3 evidence/terminal/attachment-ownership-1f/verify.py`
  — frozen fixture, five REA spans, baseline identity, selection/startup prefix.
  [Verifier output](provenance.txt).
- **Color check passed:** `node scripts/check-colors.mjs`. [Output](colors.txt).
- **Whitespace passed:** `git diff --check`.

Local typecheck, build and existing integrated TypeScript/xterm/React terminal
suites are **NOT_RUN**: dependencies are absent and installations are excluded.
Ordinary automatic hosted CI retains those existing installed-dependency checks.
Its explicit `src/**/*.test.ts` glob does **not** collect the new `.mjs` fixture;
the explicit local commands above are the focused regression evidence.

## Verification boundary and deferred acceptance

These are source-method tests with synthetic DOM/xterm/ResizeObserver boundaries,
not a running product. No app, actual DOM, PTY, browser, Mac, native executor,
package, runtime/provider dispatch, release, or dependency installation ran.
No screenshot exists because product/browser/native execution is excluded.
**PACKAGE_NOT_VERIFIED; NATIVE_NOT_RUN.** Source tests do not establish rendered
geometry, focus continuity or packaged/native parity. Existing release/native
owners retain acceptance on an identified containing package: rapid terminal
reattach/workspace transitions must retain the current host; obsolete cleanup
must not blank it, and closing/destroying the terminal must release its observer.

Ready PR against `main`, not stacked. Merge only after all triggered exact-head
workflows pass; manual-only skipped jobs are not executed native verification.
