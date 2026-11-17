# Create Plan shortcut: source-unit repair

Conductor Rebuild. This packet does not establish product, browser or native acceptance.

## Scope and cause

Revalidated default-branch head `c821b27519ab1831cf62dce6d236337bf75cc3e0`
on 2026-11-17 (initial repro: `bcb3ce4f0`). The checked Create composer
already displays `chat.togglePlanMode`'s hint and a Claude-only Plan menu, but
registers only `chat.addAttachment`. Its Plan menu changes `createPlanMode`;
there is no shortcut handler reaching that state.

The repair adds one handler, using the existing editor handle's live
`focused()` query and the same state setter. It returns false for an unfocused
editor, unsupported Reason/Codex agents, and busy creation/attachment staging.
It uses the existing registry, dispatcher and override path, not a new key
listener. The Create dialog uses `eyebrowVariant="attached"`; full-page Create
uses `"floating"`. Only the dialog binding gets `enableOnDialogIds:["dialog"]`:
that option requires an active dialog, so applying it to the page would suppress
the page shortcut. No provider, queue, WorkspaceView, menu or storage changes.

## Qualified retained Conductor evidence

Retained [Hji source](../../dialogs/workspace-launch-close/reference/Hji.txt)
and [source identity](../../dialogs/workspace-launch-close/retained-source.json)
come from Conductor 0.87.6's decoded `renderApp-D_fmY7hW.js`:

- Renderer SHA256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Retained REA lineage: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
- Hji span `[9770840,9779927)`, SHA256
  `3c5589cd46083bc08b635d4e752bfe1f93bc8456ae81e68c401dc6814948f567`.
- `pe/be` is the editor focus state, set true/false by its focus/blur callbacks.
  `oi("chat.togglePlanMode",fo,{enabled:pe})` binds the Plan command to `fo`
  only while that state is enabled.
- `fo` checks the local Claude capability (`wt`), then updates
  `selectedPlanMode:!Vn` through the launch-store updater `gr`. The menu caller
  passes that same `fo` and `Vn` through `planMode:wt?...:void 0`.
- The editor caller, focus/blur, binding, capability/setter, menu caller and
  launch-store updater are all in the retained Hji span. Exact literals and
  original UTF-8 offsets are in [reference-proof.json](reference-proof.json).

[Verifier](verify-reference.py) **passed** the span hash and all seven byte-range
checks ([output](reference-check.txt)). It reads bytes, never executes extracted
app code. These are retained REA/app-source declarations, not a fresh REA run or
observed native interaction. No new REA call, bug or gap was encountered here.

## Frozen RED / GREEN

The mounted source-unit fixture loads the real Create component/dialog through
React test renderer, with editor and IPC boundaries stubbed. The file is
byte-for-byte identical before and after the product repair:

`7e0af91637b9c61cd3ea7e9094341cf06392ea29d9df6db6ba032b2a48149713`.

- **RED** against unchanged fresh main `c821b2751`: **30 total, 26 passed,
  4 failed, 0 skipped** ([raw output, gzip](red.tap.gz)). All four failures are missing Plan
  handler assertions: dialog toggle, page toggle, focus-loss control and busy
  control. The original 24 tests and Reason/Codex controls pass.
- **GREEN** with exactly the same frozen test file: **30 passed, 0 failed,
  0 skipped** ([output](green.tap)). Original 24 controls remain passing.
- Supplemental actual-dispatcher source-unit probe: unchanged main **0 passed /
  2 failed** ([RED](dispatch-red.tap)); repaired component **2 passed / 0 failed**
  ([GREEN](dispatch-green.tap)). The probe captures the actual call-site options
  from the mounted component and binds its callback through real `bindCommands`,
  registry, overrides and dispatcher. It verifies Shift+Tab in both dialog/page,
  remapping to Shift+Command+P, and pass-through for lost editor focus, unrelated
  dialogs and terminal focus. It does not drive a DOM keyboard event or WebKit.
- **Passed:** adjacent Plan-mode and keybinding tests **43/43**
  ([output](adjacent.tap)).
- **Passed:** `node node_modules/typescript/bin/tsc --noEmit`.
- **Passed:** final `npm run build` (branding, TypeScript and Vite). Vite reports
  its existing large-chunk warning; there is no build error ([raw output, gzip](build.txt.gz)).
- **Passed:** frozen hash check and `git diff --check`.

Commands, from the repository root:

```bash
python3 evidence/composer/create-plan-shortcut/verify-reference.py
mkdir -p .qa/create-plan-shortcut/main/src/components
for file in CreateWorkspaceComposer.tsx CreateWorkspaceDialog.tsx; do
  git show c821b2751:src/components/$file > .qa/create-plan-shortcut/main/src/components/$file
done
# Expected RED: 26 passed / 4 failed.
OC_LAUNCH_CLOSE_SOURCE_ROOT="$PWD/.qa/create-plan-shortcut/main" \
  node --test src/components/createWorkspaceLaunchClose.test.ts
# Expected RED: 0 passed / 2 failed.
OC_LAUNCH_CLOSE_SOURCE_ROOT="$PWD/.qa/create-plan-shortcut/main" \
  node evidence/composer/create-plan-shortcut/run-dispatch-probe.mjs
node --test src/components/createWorkspaceLaunchClose.test.ts
node evidence/composer/create-plan-shortcut/run-dispatch-probe.mjs
sha256sum -c evidence/composer/create-plan-shortcut/fixture.sha256
node --test src/keybindings/bind.test.ts src/keybindings/resolve.test.ts \
  src/keybindings/dispatcher.test.ts src/features/chat/workspacePlanMode.test.ts \
  src/features/chat/planMode.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
git diff --check
```

## Acceptance limits

Product/browser/macOS/native/installed-package checks: **NOT_RUN**. No runtime,
installation, agent invocation, executor restart or native admission was used.
There is no screenshot or recording because this increment is explicitly
restricted to source-unit verification. Native acceptance must still show the
actual Create editor's shortcut toggles the existing Claude Plan state on a
containing package in both dialog and page, while focus loss, busy state and
unsupported-agent controls remain unchanged. Sole-executor boundaries remain.
No slash/@ behavior, long-paste work or voice claim is included.
