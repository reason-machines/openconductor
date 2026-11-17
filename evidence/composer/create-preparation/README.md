# Create prompt preparation: COMP-1 and COMP-2

Conductor Rebuild, 2026-11-17. Baseline: current default main
`fcbd2d2cb9e99dd9a66a94b8ee0b0b6780c400ac` (fetched before editing).
This is a focused follow-up to the independent Gemini Composer r4 review,
not another whole-composer parity audit.

## Repairs

- **COMP-1:** Create's Plan control inherits `settings.models.default_plan_mode`
  until the person makes an explicit choice. Both menu and focused shortcut
  toggle that same effective value; explicit false survives settings refresh.
  Claude's logical primary chat persists either `plan` or `default` through the
  existing `local_plan_mode_set` IPC, awaited before seeding/queueing a prompt or
  dispatching the workspace that can mount and send it. A rejected write exposes
  the successfully created workspace with an editable draft and warning, without
  first-prompt seeding, attachment delivery or prompt-triggered renaming.
- **COMP-2:** Any failed materialization preserves supported non-staged inline
  UTF-8 files in the pending editable draft, in order with exact text. Unconfirmed
  staged binary paths are excluded. The existing store keeps their staged data.
  Successful mixed-file delivery remains behind the existing copy barrier.

The existing owners are unchanged: Settings supplies the default, the backend
owns Plan persistence/gating, and `WorkspaceView` consumes pending draft
attachments. No settings, workspace-queue, backend, clipboard or storage rewrite.

## Retained reference and source boundaries

[Source qualification](source.json) records exact reference hashes/ranges and
baseline source identity. The retained real-Conductor REA chain is inherited
from [the launch reference manifest](../../dialogs/workspace-launch-close/retained-source.json)
and [the Plan shortcut proof](../create-plan-shortcut/reference-proof.json):
Conductor 0.87.6, REA lineage
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`, renderer
SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`,
Hji bytes `[9770840,9779927)` SHA-256
`3c5589cd46083bc08b635d4e752bfe1f93bc8456ae81e68c401dc6814948f567`.
The Hji caller passes both selected/default Plan values and toggles its effective
value; this is retained declaration evidence, not a newly observed native run.
No extracted/reference JavaScript was executed.

The ordering and error recovery fix follows current application contracts:
`useLocalPlanMode.ts` handles persisted writes/rejections;
`src-tauri/src/local_plan_mode.rs` defaults only new session rows and serializes
writes against running turns; `WorkspaceView.tsx` restores attachments on a
pending `kind: "draft"`; `ReviewButton.tsx` permits them in `PendingMessage`.
COMP-2 is an independently reproduced data-loss defect, not a new native-parity
claim about Conductor's failed materializer.

### COMP-3 remains separate

Current Create backlog still has no description/section/agent/Plan persistence,
despite its description-preservation comment. The retained Hji backlog callback
passes `description: Br.trim()` with a workspace ID. That establishes
only the reference caller's description input, not full backend persistence or
section/agent/Plan behavior. No COMP-3 code, cleanup or metadata change is bundled.
Cancel cleanup parity remains unqualified; the staged-orphan retention limit is
not newly diagnosed as a regression.

## Frozen reproduction and validation

New regression: `src/components/createWorkspacePreparation.test.ts`. The real
Create component, request builder and attachment transforms run under React test
renderer with synthetic I/O; no provider/app/browser/native execution.

- Final unchanged fixture against baseline: **11 failing / 5 passing**. Failures
  cover inherited/default-off choices, missing persistence barriers, unhandled
  rejected writes, and all three mixed-file materialization failures.
- Same fixture after repair: **16/16 passed**; combined with the untouched
  previous launch/clipboard/binary/shortcut fixture: **46/46 passed**.
- Adjacent Plan, attachment, request and keybinding controls: **71/71 passed**.
- Existing actual-dispatch probe: **2/2 passed**; retained seven-range/hash
  verifier passed. The old frozen fixture hash passed unchanged.
- `npm run build`: **passed**, including branding, full TypeScript no-emit and
  production Vite build. Vite's existing large-chunk warning remains non-fatal.
- `git diff --check`: **passed**.

Logs are in [validation](validation/). `fixtures.sha256` pins both permanent
fixtures. Reproduce RED without touching current source:

```bash
mkdir -p .qa/create-preparation/baseline/src/components
git show fcbd2d2cb9e99dd9a66a94b8ee0b0b6780c400ac:src/components/CreateWorkspaceComposer.tsx \
  > .qa/create-preparation/baseline/src/components/CreateWorkspaceComposer.tsx
OC_CREATE_PREPARATION_SOURCE_ROOT="$PWD/.qa/create-preparation/baseline" \
  node --test --test-concurrency=1 src/components/createWorkspacePreparation.test.ts
```

Reproduce GREEN and controls:

```bash
node --test --test-concurrency=1 src/components/createWorkspacePreparation.test.ts src/components/createWorkspaceLaunchClose.test.ts
node --test --test-concurrency=1 src/features/chat/localPlanMode.test.ts src/features/chat/planMode.test.ts src/features/chat/workspacePlanMode.test.ts src/features/chat/composerAttachments.test.ts src/features/draft-attachments/staging.test.ts src/workspace/createFlow.test.ts src/keybindings/bind.test.ts src/keybindings/resolve.test.ts src/keybindings/dispatcher.test.ts
node evidence/composer/create-plan-shortcut/run-dispatch-probe.mjs
python3 evidence/composer/create-plan-shortcut/verify-reference.py
sha256sum -c evidence/composer/create-preparation/validation/fixtures.sha256
npm run build
git diff --check
```

## Unverified acceptance

No screenshot, browser/native/REA execution, real provider call, macOS build,
package dispatch, installation or new watcher: this lane has no runtime lease.
The existing package check and sole-E1 admission/provider hold remain intact.
An actual containing macOS artifact and mounted/native proof are still required
for inherited/explicit Plan display, first-turn ordering, failure-warning/draft
focus and mixed-attachment recovery. Source-unit/build success proves none of
those native outcomes. Independent review of this repair is not yet a verdict.
