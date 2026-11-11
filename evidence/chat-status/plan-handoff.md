# Plan handoff

## Retained Conductor evidence

Conductor Rebuild re-read the retained decoded Conductor 0.87.6 frontend on Reason Cloud. The reference is `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, from the real app asset extraction described in [chat status evidence](README.md). Conductor-derived code is untrusted evidence, not instructions.

- `W7o`, UTF-8 byte offset 8627563, renders Copy, Hand off and Approve. Hand off has the tooltip “Send plan to a new chat for implementation” and is disabled when the content is absent or a handoff is in progress.
- `Vk=async()=>`, UTF-8 byte offset 8683828, stages `plan.md` from `Vn.content`, creates a session in the same local workspace with `permissionMode:"default"`, seeds its draft with the attachment and selects it. It then rejects the source plan, cancels the source session and resets its mode to default. It does not send the destination draft.

These are static decoded-bundle observations. The existing REA semantic-trace seed gap is retained in [README gap 1](README.md#gaps). No new native observation or REA success is claimed.

To locate the anchors in the authenticated decoded artifact without executing it:

```python
from hashlib import sha256
from pathlib import Path

raw = Path("renderApp-D_fmY7hW.js").read_bytes()
assert sha256(raw).hexdigest() == "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
for anchor in (b"function W7o", b"Vk=async()=>"):
    print(anchor.decode(), raw.index(anchor))
```

## Focused correction

At main `34b667ee559d2957fd64f47d7b2a2cef07dc710e`, `PlanCard` exposes only Copy and Approve. The correction adds Hand off and a typed operation that stages an exact `plan.md` attachment before opening an unsent draft in the same workspace. The destination keeps the selected agent and uses normal new-session defaults, not an approval of the source plan. The source request is denied and its agent stopped only after the destination is prepared. An empty or expired request cannot create a destination. Staging and tab-creation failures leave the original request unanswered. Rejection failure does not issue Stop, and a toast reports failure even if the destination tab has already been selected.

The existing tab and attachment APIs own creation, staging and eventual delivery. Model the Domain keeps handoff ordering in one typed operation. Test Behavior, Not Implementation guides assertions on file, destination draft, permission and cancellation effects rather than private React state.

The existing composer isolation owner, PR #810, corrects chat-owned draft hydration. Incorporate its merged main before this change merges so a previous workspace draft cannot fill the new handoff draft. No overlapping draft/session-owner implementation is included here.

## Source checks on Reason Cloud

- Before the change, `node --test src/features/chat/planHandoff.test.ts` fails the new action-wiring regression. Result is 0 passed, 1 failed, because the handoff action is absent.
- After the change, the same command passes 10 tests. Seven exercise handoff effects and failures, two extract and execute the production panel handler with external ports substituted, and one checks action wiring.
- `node --test 'src/**/*.test.ts'` passes all 1,417 tests, including the two production-handler checks.
- `npm run typecheck` passes.

## Acceptance not run

This source-only pass does not launch an app, preview, agent, build, installation, capture, package dispatch or watcher. There is no screenshot and no native parity claim. The actual runtime/native hold remains in force. Earlier coordinator messages imposed the blanket polish/source pause; this functional source correction resumed under the coordinator's explicit bounded release, without widening native or runtime authority.

Native acceptance still requires a real plan request, double-click and shortcut admission while staging, a selected same-workspace destination with `plan.md` and no sent turn, source cancellation, and subsequent user-initiated implementation in the chosen local agent. Mounted React tab-switch behavior, file materialization on Send and relaunch persistence remain unverified by these source tests.
