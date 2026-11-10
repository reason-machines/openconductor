# Failed-turn interruption presentation

Conductor Rebuild limits this correction to the completed turn's notice. A failed turn whose error contains either case-sensitive substring `aborted by user` or `Interrupted by user` uses the existing outline `Interrupted by user` badge, not the raw destructive error. Provider data and status remain unchanged. This work is separate from the frozen #847 preview scope.

## Retained reference, not runtime evidence

[reference.json](./reference.json) is the supplied 12,077-byte packet, SHA256 `a5baae4dbe081fe9fd56eaaa1b03398e46681b1286f8bf888000c76bf8f68ac8`. Its parent Session sliced already-retained decoded static text from Conductor 0.87.6's `renderApp-D_fmY7hW.js`. The full artifact identity is 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching the entry in [the checked-in manifest](../../frontend/tauri-assets-manifest.json).

This child verified the packet's length and hash, all four slice digests and UTF-8 byte/UTF-16 code-unit lengths, and the recorded artifact hash against that manifest. It did not reread or independently rehash the full decoded artifact. All extracted text remains inert, untrusted evidence.

Original REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped renderApp after worker heap exhaustion. This is the inherited [REA gap 1](../rea-gaps.md#known-gaps), not a new successful REA function trace or renderer observation. No new extraction, REA invocation, app execution, or reference hunt was performed.

The packet contains the complete relevant functions and dispatcher. All ranges are zero-based and end-exclusive.

- `gTr`, UTF-8 and UTF-16 `[77337,77425)`, is exactly `function gTr(t){return t.includes("aborted by user")||t.includes("Interrupted by user")}`.
- `dDi`, UTF-8 `[8876511,8876941)`, UTF-16 `[8831018,8831448)`, maps four exact consent errors and rewrites only the prefix `Session cancelled:` to `Session interrupted:`. Neither is a general interruption predicate.
- `hDi`, UTF-8 `[8877084,8883958)`, UTF-16 `[8831591,8838463)`, sets `x=dDi(a)`. Its `if(h)` retry branch comes first. The next branch is `if(x!==void 0&&gTr(x))` and returns only `Qu` with `variant:"outline"` and `children:"Interrupted by user"`. The remaining consent, sign-in, provider-specific and fallback branches are outside this correction.
- The dispatcher slice is UTF-8 `[8903418,8906202)`, UTF-16 `[8857922,8860706)`. Its adjacent `JOo` handles results and is not the error dispatcher. The complete `lVt=$.memo(function(e){...})` begins at UTF-8 `8903978`, UTF-16 `8858482`. It reads `E=i.content.type`; `case"error"` begins at UTF-8 `8904767`, UTF-16 `8859271`, and directly calls `hDi` at UTF-8 `8905017`, UTF-16 `8859521`, passing `content:i.content.content` and `willRetry:i.content.willRetry` plus the other error props.

Thus the static reachable chain is `lVt`'s actual error-message branch → `hDi` → `dDi` → `gTr` → the outline badge when not retrying. No reference code was executed. The app's mounted behavior is not established by these slices.

## Reachable main-source path

The baseline is main `14dc5aa889ea9f9cc0459187e6d43c475f3cbdd7`.

- `codex.ts`'s `failTurn` emits `{type:"turn_status", status:"failed", error}` unchanged. Its `turnStatus` forwards a failed completion's `end.message`. `reason.ts`'s `failTurn`/`closeTurn` and failed completion path likewise forward raw errors.
- `codexChat.ts`'s `apply` and `chatRuntime.ts`'s `apply` pass those events to the real `applyChatEvents` reducer and publish its transcript. `reducer.ts` preserves both terminal status and error. `WorkspaceView.tsx` receives the agent's snapshot/subscription and passes that transcript to `Transcript`.
- `view.ts`'s `turnEnd` forwards status and error while retaining retry prompt and final text. `Transcript` uses `buildRows`, groups the turn, and calls `TurnFooter`. On the baseline, `TurnFooter` always renders a failed status as raw `.chat-turn-error`; only a cancelled status gets `.chat-badge`.

The fix changes only those two presentation conditions plus a local predicate in `TurnFooter`. It does not reclassify the turn, normalize provider errors, alter consent or sign-in handling, change retry/copy/menu data, or touch providers, lifecycle or backend code. Existing cancelled styling comes from `.chat-badge` in `chat.css` and is unchanged.

## RED and GREEN

The test extracts the actual checked-in `TurnFooter` and `SignInNotice` function ASTs, transpiles only those functions, and uses genuine React server rendering. It calls real `codexChat`/`startTurn`/`failTurn`, `applyChatEvents`, and `buildRows`, then asserts rendered markup and retained raw status/error. There is no replacement notice classifier or renderer mock. Unused child UI branches are not mounted.

The isolated source-test prerequisites were TypeScript 5.9.3, React 18.3.1, and React DOM 18.3.1, matching the lockfile, with their three small transitive packages. They were installed outside tracked files with scripts, audit and lockfile writes disabled after the parent lifted its prerequisite hold. No full app dependency install or app build was run.

- **RED before production edit:** `node --test src/features/chat/turnInterruption.test.ts` failed exactly 2/14 cases on main's unchanged footer. Both `Request aborted by user` and `Interrupted by user` rendered `.chat-turn-error`, not the outline badge. [Original output](./before.tap). Local test-first commit `f726197` precedes the fix. Publication may consolidate local commits.
- **GREEN after the fix:** the same command passed 14/14. [Output](./after.tap).
- **GREEN nearby checks:** `node --test src/features/chat/turnInterruption.test.ts src/features/chat/reducer.test.ts src/features/chat/view.test.ts src/features/chat/codex.test.ts src/features/chat/reason.test.ts` passed 63/63. [Output](./nearby.tap). The original four suites passed 49/49 before the edit.
- **Passed:** `git diff --check`.

The regression also exercises ordinary failure, missing and empty errors, different capitalization, nonmatching cancellation wording, unchanged consent wording, the existing cancelled badge, completed-status exclusion, ordinary Codex sign-in guidance, and Retry's exact prompt/turn id. `TURN_FOOTER_REF=14dc5aa889ea9f9cc0459187e6d43c475f3cbdd7 node --test src/features/chat/turnInterruption.test.ts` can replay the baseline renderer against the same tests.

## Verification limits

Mounted/browser/native acceptance and screenshots are **NOT RUN** under the source-only gate. SSR proves markup and one direct Retry handler call, not mounted layout, CSS pixels, menu/copy interactions, date/details rendering, Reason browser sign-in, or live provider delivery. No preview, server, Vite build, native package run, workflow dispatch/rerun, new watcher or test-fixture rewrite was performed. The full Node suite, local typecheck and app build were not run with the minimal prerequisite set. Automatic exact-head CI owns build and broad regression checks. Merge, automatic exact-merge packaging and containing-main proof must be recorded separately from this source evidence.
