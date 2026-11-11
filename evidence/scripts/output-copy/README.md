# Script output copy whitespace

Conductor Rebuild adds only the copy listener and its cleanup to `ScriptOutput`. A selection ending in spaces before later terminal text now passes through the retained reference's per-line trimming rule. Leading spaces, internal spaces, and selected blank lines stay intact. A collapsed selection does not intercept copy.

## Source evidence

The retained Conductor renderer was acquired through REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. [Source identities](source-identity.json) record its asset hash and exact UTF-8 spans. The [copy listener](reference/lno.txt) calls [the trimming function](reference/t9s.txt), which removes only trailing spaces and tabs on each newline-delimited line. The retained setup and Run call chains lead to that terminal factory. These are compiled-source observations, not reference runtime observations.

The baseline is main `d8f6bdfd26370491295f38ffecd7090c71a2a6db`. Its five recorded input files match the earlier source packet byte for byte. `ScriptOutput` opens xterm without a custom copy listener. xterm's `SelectionService.selectionText` translates selected buffer substrings, and its native copy listener writes that selection unchanged. The proposed counterexample selects `alpha   ` before `beta` in the same buffer row. Actual buffer and selection methods, rather than a replacement trimming helper, produce the fixture's selection text.

The product patch registers after `term.open`, so the listener runs after xterm's native listener on the same element. Cleanup removes the exact listener from the captured terminal element before disposing the terminal. The [retained patch](copy.patch) has no OSC8, WebLinks, backend, session, dependency, or native clipboard changes.

## Regression packet

[src/scripts/outputCopy.test.ts](../../../src/scripts/outputCopy.test.ts) mounts the real component with React Test Renderer. It uses the installed xterm source implementations of `BufferLine`, `Buffer`, `SelectionService`, and `copyHandler`. DOM event targets, rendering, observers, and unrelated component hooks are replaced at their boundaries. This does not run a real terminal renderer or system clipboard.

All nine original test bodies and assertions remain byte-identical to the [frozen fixture](frozen-outputCopy.test.ts.txt). Only `CopyEvent`'s TypeScript constructor parameter property is expanded to an explicit field and assignment, because Node 22's type stripping does not transform parameter properties. Both fixture hashes and that exact reversible syntax change are recorded.

The nine cases cover partial-line trailing spaces, multiline trimming with indentation and internal spaces, a spaces-only selection, selected blank lines, an unchanged-text control, a collapsed selection, copy outside the terminal, missing clipboard data, and listener removal on unmount.

## Verification

Passed, source identity only, on a Reason cloud computer:

```bash
python3 evidence/scripts/output-copy/verify-source.py \
  --reference-renderer .oc-tmp/scripts-audit-1222/originals/renderApp-D_fmY7hW.js
git apply --check --reverse evidence/scripts/output-copy/copy.patch
git diff --check
```

The [source check receipt](source-check.json) verifies five baseline file hashes, all sixteen retained reference spans against the full renderer, the exact product candidate, and the fixture-only syntax change. It executes no JavaScript or application behavior.

Not run locally: `node --test src/scripts/outputCopy.test.ts`, typecheck, build, broader tests, browser, or native tests. The expected baseline result is four clipboard-payload assertion failures and five passing controls. That is an unobserved expectation, not a RED result. The same nine cases must run on the candidate for GREEN. Setup, resolver, or loader failures do not establish the intended failure.

The existing sole executor retains behavioral coordination and its older disposal, cancellation, and OSC8 queue order. This source increment does not admit another local runtime. Normal hosted PR checks can execute the after-fix tests but cannot establish the baseline RED on their own.

No screenshot is supplied because browser and native execution are outside this lane's admission. Native clipboard delivery, xterm rendering, and side-by-side installed-app behavior remain unverified. The original REA renderer analysis exhausted its worker heap, so the retained byte-span evidence is not a complete semantic call graph.

## Scope decisions

The Laziness Protocol keeps the product change to nine lines in one existing effect. Test Behavior, Not Implementation keeps the regression assertions on clipboard payloads, event cancellation, and observable cleanup rather than the handler's source text.
