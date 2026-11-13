# Conductor Rebuild: first visual line queue focus

Plain Up on the first visual line focuses the final queued message, including a nonzero caret position. Later visual lines, selections, later paragraphs, active queue editing, composition, and suggestion menus keep their existing behavior. A missing queue-row element does not consume Up.

The editor exposes its existing `endOfTextblock("up")` decision through the optional `atTop()` handle. The queue handler prevents default and propagation only after a row is found and focused. Optionality preserves existing editor-handle consumers.

## Source qualification

The integration starts at main `57e3d6982095aa563bf31bac47efbd984214fe9a`, including #1055's asynchronous submission contract. Its Props and submit hunks are unchanged. Only the two queue-focus hunks in Composer and the handle/geometry hunks in ComposerEditor change production code. The Editor bytes match the sealed candidate exactly. Composer differs from that candidate only by #1055's already-merged changes.

`python3 evidence/chat/composer/first-visual-line/verify-current.py --renderer .source-prep-13576/retained-originals/renderApp-D_fmY7hW.js` passed. It checks seven retained real Conductor source spans, both baseline source inventories, fifteen unchanged fixtures, the exact V2 fixture, the original twenty-case assertions, product identities, and preserved results. See `current-main.json` for precise identities and gate states. The original `verify-source.py` verifies historical candidate identities, not this integrated Composer.

## Preserved runtime evidence

- V1 remains failed: 19 passed and one mention setup failure. Its original fixture and terminal results remain inert evidence under `v1/`.
- The V2 successor fixes only mention setup, supplying a synthetic workspace path and one argument-checked empty search response. No keyboard, document, history, or queue assertion is weakened.
- V2 original-baseline suggestion controls passed 2/2. Full historical candidate passed 20/20, exit 0, without skips. Exact TAP and losslessly compressed original receipts are retained here.
- Current-main candidate, nearby regression suites, and typecheck have not yet run at this source milestone. They use the existing serialized validation route or normal automatic hosted checks. Historical 20/20 is not current-main qualification.

## Limits

Native, browser geometry, visual parity, real IPC, provider behavior, and installed-app acceptance are NOT RUN. The component fixture uses real headless Tiptap documents and production React adapters, with substituted geometry and focus endpoints. No screenshot is supplied because browser/native execution is held.

The previously unmerged modified-suggestion-key increment is excluded from this PR. Its original commit `ab5df1121603f23f9209fa1a29e89a1fdd2b1516` and a separate recovery patch remain preserved. No existing main test is removed.

## Integrated-source execution

The admitted unchanged V2 fixture passed 20/20 on published code `3a04378db67472fc3f3bb7444fbac4ba540aa941`, containing main `31b675fb4e7849b80b52f1abf060e7d466570ac1`. The separate unchanged queue-focus and reserved-space suites passed 19/19. Both exited zero with no skips, and source/dependency identities and actual empty process-group releases passed. Original complete TAP and compressed receipts/preflights are retained here.

The separately admitted full configured TypeScript 5.9.3 check included `src` and `vite.config.ts`, with `--noEmit --pretty false --incremental false --project tsconfig.json`. It failed with a 384 MiB V8 heap exhaustion, exit -6, before producing TypeScript diagnostics. Its process group was empty at release `2026-11-11T17:00:52.452076Z`. All 985 program files, 2,313 runtime dependency pins, 8,055 additional type/manifest pins, and the tracked tree remained unchanged. The full failure log, prepared input hashes, supervisor, route and post-failure check are preserved. No larger heap, retry, narrowed config, install or infrastructure change was made. Standard automatic hosted typecheck is a distinct pending verification route, not a retroactive pass for this failed local attempt.
