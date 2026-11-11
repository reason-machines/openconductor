# Plain-file punctuation delimiters

Owner: Conductor Rebuild. Unit: BE7-04.

## Source assessment

Default main was resolved through the connected repository and fetched at
`672a32626cbf0e86f9325f4310559e72cd21ddf4`. The assigned branch was integrated
with that main; its resulting tree matched main before these fixtures.

At this commit, `src/features/chat/markdown.ts` has Git blob
`158aa0a2a44617764afba5e930f6d81370a91186`; the pre-fixture test blob is
`0c2518975621632de93f0a522ff1fddcc9ada936`. Both match the retained source
packet. The recognizer requires a leading delimiter for every path alternative;
commas and colons are not accepted delimiters. Source therefore predicts that
`src/a.ts,src/b.ts` omits the second file button, and `files:src/a.ts` omits its
file button. This prediction is not an executed result.

## Retained reference evidence

[Plain-file delimiter packet, revision 3](https://reasonmachines.com/agents/8e693aec-e47b-440b-825f-0796c2b59c8b?page=0f4f7c0c-6ad7-4f4c-9445-2b250e013700)
contains the producer, recognizer, renderer and resolver chain. Its retained
Conductor renderer is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The retained index is `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256
`b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
These identities are inherited from the packet, not newly rehashed here.

The retained decoded excerpt was reread from parent Session source
`433998d6-0ebb-415f-a218-a6461e34db3d`, revision `25950990`:

- `vXs [6536620,6536857)` gives the bare-relative alternative no leading
  delimiter condition. Its absolute and dot-prefixed alternatives have their
  own leading conditions.
- `xXs [6536881,6537542)` processes all matches and preserves intervening
  text, including the comma.
- The packet closes assistant producer `ROo` through `xS`, `pEi`, `BXs` and
  `SXs=[wXs,xXs,Rzs]`, then `cEi` through `RX=WGt` and `IXs`. Accepted file
  links require a resolver result and callback in the reference.

REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`
parsed the index but heap-skipped the renderer. Renderer evidence uses retained
manually decoded bytes. No new acquisition, analyzer execution or reference
runtime comparison was performed.

## Regression contract

Nine adjacent tests use the real Markdown renderer and its existing component
test surface. Three regression cases require comma-adjacent ordered targets,
a preserved colon prefix, and ordered file callbacks without an external-link
callback. Six control cases cover spaces/parentheses, unchanged absolute and
dot-prefixed boundaries, URLs/explicit links, inline code/fences, missing
workspace context, and traversal/root rejection.

The fixture-only commit left the production recognizer unchanged and established
actual RED in automatic hosted CI before the correction. The correction admits
non-path punctuation before bare-relative paths. Its added prefix alternative
excludes slash and dot-prefix starts, so absolute and dot-prefixed paths keep
their existing delimiter rule. Path characters, the visitor, resolver and
callbacks are unchanged. The same test bytes must establish GREEN. No tests,
build, dependency installation or product runtime were run locally.

## Scope and limits

Only the bare-relative delimiter rule in `markdown.ts`, adjacent regressions in
`markdown.test.ts`, and this isolated evidence file are leased. Do not change
resolver, callback, absolute/dot-prefixed recognition, accepted path characters,
URL/link/code/fence handling or strict workspace containment.

A file-button callback receives a normalized contained absolute target. The
workspace adapter ultimately uses `diff.openPath`, which selects from loaded
changed files only. These tests prove neither arbitrary-file navigation nor
line forwarding, percent decoding, filesystem existence, symlink containment
or native/visual parity. The existing no-callback rendering difference is not
changed. No screenshot exists because browser/native execution is excluded.

## Hosted execution receipt

Fixture-only published head `2eaa8808cb9d925301a9b43081dabe854d3bdd7a`
ran [automatic CI 42863430032](https://github.com/reason-machines/openconductor/actions/runs/42863430032).
The [frontend unit job](https://github.com/reason-machines/openconductor/actions/runs/42863430032/job/129995326332)
ran `node --test "src/**/*.test.ts"` and reported 1,830 tests, 1,827 passed and
exactly three failed. All failures are the intended new regressions:

- Test 378, `comma-adjacent bare relative paths keep both targets and the comma`,
  expected both targets but received only `/repo/src/a.ts`.
- Test 379, `a colon before a bare relative path stays text beside its file button`,
  expected `/repo/src/a.ts` but received no targets.
- Test 380, `punctuation-adjacent file buttons invoke ordered file callbacks only`,
  expected both button titles but received only `Open /repo/src/a.ts`.
  This RED fails before callback invocation. It is not a callback execution result.

All six new controls, tests 381 through 386, passed. The separate
[typecheck/build job](https://github.com/reason-machines/openconductor/actions/runs/42863430032/job/129995326811)
passed `npm run typecheck` and failed at its duplicate frontend unit step.
Build and later checks in that job were skipped, not passed.

The nine cases remain byte-identical to fixture-only test blob
`f80173b0d77b6d524b3ee4ee6229cf8ef5e5aeb3`. Hosted GREEN after the production
correction is pending. No local test or build result is claimed.
