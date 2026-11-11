# Fenced-code copy rejection feedback

## Retained source

This change uses the already-held shipped renderer and 27-span literal/hash packet handed to this Session. It does not acquire or run Conductor.

- REA receipt: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
- Renderer: `renderApp-D_fmY7hW.js`, 11,600,457 bytes.
- Renderer SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Handoff archive SHA-256: `b323ea5a9ea6c92b520fadf7349e8c35b59162c9a8e719648d848a65a6c55db3`.
- The builder independently compared all 27 packet literals and SHA-256 values with their UTF-8 half-open byte spans in that renderer. All passed.

The retained packet closes the assistant path `ROo → xS → pEi → dHn → VXs/$Xs → WJe → t0 → hZr → kt.error → BM/vBr → Yhi/aMt → SLr/wLr → BBr/LBr/Xhi → _wa`. These are shipped/minified symbols, not original source names. This is static evidence, not observed native behavior.

`t0` at `[1793169,1794797)` handles successful copy with `x().then(()=>{_(!0),setTimeout(()=>_(!1),2e3)}).catch(hZr)`.

`hZr` at `[1794797,1794905)`, SHA-256 `73db96f11470171b67c4495eb52e07f55c2dd0b75647b4a7149e42c25e6be166`, contains:

```javascript
function hZr(t){Bt.error("Failed to copy: ",t),kt.error("Failed to copy",{description:"Please try again."})}
```

The implemented contract is the visible error request only: title `Failed to copy`, description `Please try again.`. This change makes no claim about a new logging policy and does not change logging.

## Existing notification delivery

Immediately before the production edit, fresh main was rechecked at `9b3c1be1cfcb666da39d74d0188442a52d8d744e`. The chat/notifier files below were unchanged from the RED baseline `aa9b44f5dcadceb5cef37d405f3ffbd9fd8fad8f`.

[App](../../../src/App.tsx#L152) obtains `show` from `useToasts` and [passes it as `notify` to `WorkspaceView`](../../../src/App.tsx#L555). [WorkspaceView passes that same callback to `ChatPanel`](../../../src/components/WorkspaceView.tsx#L1336), which [passes it to `Transcript`](../../../src/components/WorkspaceView.tsx#L539). No callback wrapper drops its arguments.

[Toast's `show`](../../../src/components/Toast.tsx#L13) already accepts the optional description and retains it on the toast item. [The existing renderer](../../../src/components/Toast.tsx#L40) uses `role="alert"` for errors, renders the title at line 42, and renders the description in `span.toast-description` at line 43. [App mounts the same Toaster](../../../src/App.tsx#L473). This change uses that producer and renderer. It adds no toaster, styling, duration, or success-toast policy.

A separate hosted Node execution of the actual `useToasts`, `Toaster`, and `Toast` also passed: calling `show("error", "Failed to copy", { description: "Please try again." })` produced one alert containing the exact title and description and no success status. Only icon/motion presentation was stubbed; no clipboard handler was called. This checks the existing producer/consumer in addition to the regression's actual mounted Transcript callback delivery.

## Hosted regression

[The fixture](../../../src/features/chat/copyCodeFeedback.test.ts) executes the production `Transcript`, assistant `Part`, `Markdown`, `CodeBlock`, and actual `CopyCode` handler with React test renderer in hosted Node. TypeScript transpilation only makes the existing TSX modules executable in that fixture. Unrelated transcript branches throw if reached.

The clipboard is an isolated object in a Node VM, returning a manually settled Promise. The fixture never reads or writes a browser, OS, or native clipboard. Its code-copy timer is a deterministic test clock, not a real two-second sleep.

Before any production edit:

```bash
node --test src/features/chat/copyCodeFeedback.test.ts
```

Result: **RED**, exit 1, 4 tests, 3 passed, 1 failed. The decisive rejection assertion was:

```text
Rejected CopyCode must request the existing notifier's failure feedback
+ []
- [['error', 'Failed to copy', { description: 'Please try again.' }]]
```

The three controls passed before the fix: ordinary success only after fulfillment with the existing 1999/2000 ms reset boundary, handled rejection without a notifier, and no feedback for ordinary text or inline code.

The RED fixture was committed before the production fix. Its SHA-256 is `7851a962f637106c096efda1e8756d12a593a7765a5a27d5ee9b8256474df6c3`. After the fix, the same command and unchanged SHA passed: **GREEN**, exit 0, 4 tests passed, 0 failed.

Nearby validation also passed:

```bash
node --test src/features/chat/markdown.test.ts src/features/chat/markdownFrontmatter.test.ts
# 88 tests passed, 0 failed

git diff --check
# passed
```

The local `npm run typecheck` attempt timed out after 120 seconds and is not reported as passing. Full typecheck, build, and broader validation are delegated to the repository's hosted CI rather than repeated under local resource pressure.

## Scope and acceptance limits

The copy payload remains `text` supplied by `content.trim()`. Code-block layout, inline `Copied` confirmation after fulfillment, and the existing two-second reset remain unchanged. Full-message, user-message, and link-copy behavior are not changed. Thinking is not wired to the new callback.

Native, local runtime, browser, and real-clipboard acceptance are **not run and unverified**, as required by this task. There are no screenshots because no visible-app or browser execution is authorized. Hosted handler checks establish the feedback request, not native presentation parity.

The main macOS packaging workflow builds the consuming app and checks its packaging contract after merge. Its exact run/build identity and contract result are tracked in the pull request and delivery report; a merge alone is not package verification.
