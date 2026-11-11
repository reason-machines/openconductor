# Recent-chat overflow popup

Conductor Rebuild owns `CHAT.RECENT-CHIP-OVERFLOW-POPOVER`.

## Source contract

Retained Conductor 0.87.6 frontend source uses a controlled Popover in `uKn`. With six eligible chats, four chips remain inline and the retained `+2 more` trigger opens a separate popup containing the other two. The popup is bottom/start aligned with a 4px offset, 256px width, 8px padding, and an inner column limited to 288px with vertical scrolling. `RIo` and `EIo` do not explicitly close the popup after a source selection.

The retained Popover module, dismissal handler, focus handler, container hook, and nested-layer hook qualify Escape and outside-press handling. This is static source evidence, not a new observation of the original app. The nine full spans and both original asset hashes are in `source.json`.

## Frozen regression

`tests/chat-search/recentChatOverflow.dom.test.mjs` is unchanged from the reviewed fixture. Its SHA-256 is `6f77ff55ecbeb1519e77d6599368492a901f17156184903ddcfe42bb83c6472d`.

Eight cases mount the complete production `ChatEmptyState`, with only icons and CSS stubbed. The first case exercises the installed `@base-ui/react` 1.9.0 Popover without mocking it. It verifies keyboard Escape focus restoration and a physical outside-click path that leaves focus on the clicked button. Product cases cover the initial four-chip group, retained trigger, separate overflow popup, Escape, outside dismissal, source identity, selection keeping the popup open, reopening without duplicates, and five fitting chats without overflow.

The shared mouse helper sends `detail: 1` on mousedown, mouseup, and click. The primitive's second opening uses the same helper as the product. Its first virtual opening is separate keyboard-path coverage.

## Verification at publication

- Passed on Reason Cloud. Both retained original asset hashes and all nine source spans rebound byte-for-byte.
- Passed. The three baseline source snapshots match main `47463ddaf959a7ee394d3d64a5b22e3eccbda74c`.
- Passed. The fixture hash and eight-case count match the reviewed packet.
- Passed. `git diff --check` and the product-source comparison against that main commit.
- Not run yet. Hosted primitive control and product DOM regressions. The initial ready PR contains tests and proof only, plus the existing CI step's single-line chat-search glob change.

Run the static proof with retained original assets available:

```bash
python3 evidence/chat/recent-chip-overflow/verify_source.py \
  --original-dir .rea-work/retained-reference \
  --baseline-ref 47463ddaf959a7ee394d3d64a5b22e3eccbda74c
```

The ordinary automatic CI step supplies `ONBOARDING_DOM_DEPS` and runs:

```bash
node --test --test-reporter=tap tests/chat-search/*.dom.test.mjs
```

## Limits

No local Node, React, browser, native app, provider, CLI execution, or installation ran. There is no screenshot because visible execution is outside this lease. Static source proof does not establish runtime behavior or native geometry. A hosted failure counts as product RED only if the real primitive control passes and the failure reaches the intended product assertion. No product fix may precede that result.

Workspace transcript production, recent-chat eligibility policy, shared Popover code, attachments, backend behavior, and frozen #847 are outside this change. A separate owner handles the shared zoom failure through #1092. Every exact-head check must positively pass before a merge request, including optional checks.
