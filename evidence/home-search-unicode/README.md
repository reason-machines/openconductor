# Home search: consistent UTF-16 highlight offsets

Conductor Rebuild / `HOME-SEARCH-UTF16-271-03`. Qualification baseline main: `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5`. Separate delivery revalidated on main `ecfa14321c36e33862265eb5788dd0b95efa4876`, after #1413 merged.

## Actual local source contract

The retained Conductor 0.87.6 REA renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. [reference.json](reference.json) preserves nine exact original-byte spans, their offsets/hashes, five baseline source hashes and the frozen regression hash. The renderer and all nine spans were freshly checked, without evaluating original JavaScript or acquiring new REA data.

This consumer is mounted on normal local Home: `/all-workspaces` binds `UJo`; its noncloud branch feeds the ordinary list. `UJo` computes the displayed name, calls `pFi` and forwards `fieldMatches` through `iJn` and `_Jo` into `u2`. `pFi` → `AJo` → `TJo` produces UTF-16 string offsets using `indexOf` and query-word length. `u2` consumes those same offsets by grouping consecutive UTF-16 string positions into matched/unmatched runs.

OpenConductor's existing matcher preserves those UTF-16 offsets. Its Home `Highlight` instead used `Array.from(text)` and interpreted each code-point ordinal as an offset. A stored local name with an astral character before a match therefore highlighted the wrong substring: searching `launch` in the regression's rocket-prefixed name marked `aunch `; searching the rocket marked it plus the following space. The complete text and matching membership were unchanged.

The witness uses a persisted, explicitly named local workspace. Stored-name precedence avoids live-branch, PR-title, target-branch and cloud-only assumptions. The rejected header-display-name candidate is separate scratch evidence and is not part of this repair.

## Smallest coherent change

Only `Highlight` in `src/components/AllWorkspaces.tsx` changes: slice contiguous runs at the matcher's UTF-16 boundaries, preserving intact surrogate pairs when the complete character is matched or unmatched. Existing mark/span styles are retained. No matcher, label rule, filter, ordering, CSS, persistence, sidebar, header, backend or provider change.

Ledger dedupe preceded the fixture; the actual frozen failing regression and normal-local consumer join preceded the product edit. The successor is isolated from open PR #1413 and is not stacked on it.

## Qualification checks actually run on Reason cloud

- **RED:** `timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/homeSearchUnicode.test.ts` → five passing controls and five intended highlight failures, zero skipped/cancelled. [red.tap.gz](red.tap.gz)
- **GREEN:** the identical command and byte-identical frozen file → 10/10 passed. [green.tap](green.tap), [fixture.sha256](fixture.sha256)
- **Adjacent:** `timeout 150s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/allWorkspaces*.test.ts src/components/home*.test.ts src/home/*.test.ts src/components/sidebarLabel.test.ts src/state/persisted.test.ts` → 226/226 passed. [adjacent.tap](adjacent.tap)
- **Build:** `timeout 180s npm run build` → branding check, complete TypeScript check and Vite production build passed. Vite's bundle-size advisory remains a warning, not a failed check. [build.txt.gz](build.txt.gz)
- **Source/freeze:** `python3 evidence/home-search-unicode/verify_reference.py --renderer <retained-renderer>` verifies original-byte custody, the frozen fixture and unchanged code outside the single helper; `sha256sum -c evidence/home-search-unicode/fixture.sha256` and `git diff --check` pass.

The new regression renders production `AllWorkspaces` with actual persisted-row conversion and matching logic. It checks literal highlighted text, complete label/title, membership and absence of state mutations/actions. ASCII, BMP prefix, astral prefix, two astral prefixes, emoji query, multiword, case-insensitive, post-match emoji, empty-query and branch-only-match cases are frozen. Existing adjacent fixtures retain no-match, numeric, filter and keyboard controls without edits.

The RED and build logs are losslessly gzip-compressed so their original whitespace and output bytes remain intact without introducing trailing whitespace into the diff.

## Fresh-main delivery checks

After #1413 merged at `ecfa14321c36e33862265eb5788dd0b95efa4876`, the unchanged frozen fixture reproduced the same **5 pass / 5 intended failures** before the helper patch, then **10/10 passed** after it. The same adjacent command now passes **236/236**, including #1413's original ten cases. The same production-build command passes branding, full TypeScript and Vite. Fresh logs: [RED](fresh-main-red.tap.gz), [GREEN](fresh-main-green.tap.gz), [adjacent](fresh-main-adjacent.tap.gz), [build](fresh-main-build.txt.gz). The reference verifier pins this delivery baseline and checks the retained renderer, nine source spans, unchanged fixture, and the Highlight-only production boundary. Frozen fixture SHA-256 remains `48e1a9edc6d94caf3f1913ec3a59ed208fa23932a2d919a8cbc6c0a0bb8447e7`.

The original qualification logs remain intact above. No existing fixture or expectation was changed; no #1413 successor commit was published before that PR's confirmed merge.

## Limits and serialization

React test-renderer is not browser pixels or installed macOS acceptance. No screenshot is attached because browser/native execution remains with the existing serialized owner and was not admitted here. Full-suite, native/provider, installation, packaging and side-by-side visual acceptance were not run; no manual workflow dispatch or watcher was created. Package #1791 excludes this successor. Exact published-head checks must pass before merge; source inclusion is not repair embedding/runtime or native proof.
