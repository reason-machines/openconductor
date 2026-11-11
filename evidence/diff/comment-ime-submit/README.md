# Inline comment keyboard handling during IME composition

Conductor Rebuild qualified `DIFF-COMMENT-IME-SUBMIT-01` against main `435c3356902c3e7cdf246f3089029154b3f908f6`. The retained real Conductor renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Exact UTF-8 spans and hashes are in [source.json](source.json), with complete handlers under [reference](reference/).

## Source contract

`SVo` renders the comment editor through `bVo` and `lHt`. The complete `lHt` editor and bubbling handlers reject keys while its composition flag is active or `oRt` detects composition on the event. `oRt` recognizes `isComposing` and legacy key code/which 229. Composition start activates the flag; end and blur clear it. These guards run before submit and before `bVo` can cancel on Escape.

Current OpenConductor instead handles modifier Enter and Escape directly in its local inline-comment `Composer` inside `ReviewComments.tsx`. It neither tracks composition nor checks the native composition event. The same composing modifier Enter can therefore submit a nonblank draft. Composing Escape can cancel an unchanged comment or open a dirty-discard dialog. This is a static source mismatch, not a recorded real-app interaction.

## Regression-first milestone

The initial commit deliberately changes no product code. It introduces one 16-case fixture for the actual mounted comment `Composer`. The paired workflow first runs that exact fixture against pinned main. Eleven named assertions must fail for the missing IME guard, and five controls must pass. Setup errors, different assertions, incomplete cases, skips and cancellations are rejected. The unchanged fixture must later pass all 16 cases against the corrected candidate.

The cases exercise native composition flags, composition lifecycle state with a false event flag, keyCode/which 229, Escape, composition end and blur, normal Meta/Ctrl Enter submission, blank text and ordinary dirty cancellation. Real React runs the actual component; `DialogFrame` and unused external boundaries are substituted. No test checks the implementation's variable names or source text.

```bash
python3 evidence/diff/comment-ime-submit/run-paired.py --self-test
python3 evidence/diff/comment-ime-submit/run-paired.py --out /tmp/comment-ime-proof
```

The Python verifier self-test passed locally. It used only synthetic TAP and ran no product code. Component execution is admitted only through the automatic hosted workflow. No local Node, typecheck, browser or native execution was run.

## Scope and limits

The intended correction is only the inline-comment Composer's composition lifecycle and keyboard guard. The Laziness Protocol keeps it in the existing module. Fix Root Causes puts the guard before either keyboard action, rather than trying to undo an accidental comment save. Shortcut remapping, the chat composer, comment draft storage and backend behavior are outside this change.

The six-case comment-edit retention fixture, moved-anchor fixture and hidden-whitespace fixture remain byte-for-byte unchanged. Their baseline and assertion identities are preserved. Candidate source pins may be explicitly requalified after the product fix.

The mounted fixture does not prove browser DOM behavior, real platform IME event ordering, SQLite transport, native/E1 behavior or visual parity. There is no screenshot because those runtime surfaces are not admitted.
