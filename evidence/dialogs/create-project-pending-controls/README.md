# Create project pending control editability

Conductor Rebuild. Hosted baseline qualified four intended behavioral failures with all four controls passing. The candidate removes only the four pending-disabled properties. Candidate hosted checks are pending. No native result is claimed.

## Source qualification

The complete retained Conductor `gbi` declaration occupies renderer UTF-8 bytes `[2104111,2112006)`. It initializes name `n`, parent `d`, template `r`, step `m` and log/error state. `H=E.isPending||m!==""` gates the primary button and configured shortcut. The name input, parent input, Browse button and native template buttons have no pending-disabled property. The input/button/prop-composition/dialog routes are retained in nine hash-bound spans. The pending value is not passed to the dialog ancestors.

`F` snapshots its submitted slug and parent as `U` and `z` before awaiting and retains the invocation's lexical template `r`. Current `submit` likewise passes a captured `{ parentDir, slug, template }` request before awaiting. Draft edits must not mutate or restart that operation.

Current `CreateProjectDialog.tsx` adds `disabled={pending}` at four sites: name, parent, Browse and template mapper. `source.json` binds all five scoped files to fresh main and records their equality to the previous qualification. It also retains the real-app REA lineage, renderer/archive identities and the existing eight frozen files.

## Frozen regression

`src/components/createProjectPendingControls.test.ts` mounts the actual CreateProjectDialog and DialogFrame, uses the actual create/clone helpers, and executes the actual backend create/picker wrappers. Tauri core and picker I/O, preference storage, first-workspace service I/O, icons, motion and Base UI portal hosting are synthetic. No native picker, filesystem, GitHub operation or project scaffolding occurs.

The host input/button's disabled state is asserted before invoking its callback. A disabled callback is never invoked to pretend a user edited or clicked it. Request payloads are captured at the synthetic Tauri command boundary, not reconstructed from the component's state.

Four intended failures while creation is unresolved:
1. Name edits update the draft without changing the active request and survive rejection.
2. Parent edits update the draft without changing the active request and survive rejection.
3. Browse updates only the draft, uses the current draft default path, and preserves Cancel. Successful creation still registers the original captured folder.
4. Next.js selection updates the draft without adding scripts to the active Empty-template invocation.

Four independent controls:
1. Pending primary/shortcut/duplicate-submit guards and progress remain intact.
2. Successful creation retains its captured request, registration, preference and completion callbacks.
3. Failure retains the submitted draft; editing after failure creates a new captured retry.
4. Idle Browse Cancel leaves the displayed folder unchanged and starts no creation. Pending Cancel is covered inside the intended Browse case, after the enableability check, rather than by bypassing a disabled baseline button.

The whole fixture is sealed by `fixture.sha256`. Require the ordinary automatic hosted `node --test "src/**/*.test.ts"` run to show exactly these four intended failures and four passing controls, plus a successful build, before changing product code. Import/setup/typecheck failures are harness failures, not behavioral RED. Keep the same fixture for candidate GREEN.

## Observed hosted baseline and candidate

Baseline head `e31b5e770b8e3d35c45ac51c60860cf027186d56`, automatic [CI run 43125214106](https://github.com/reason-machines/openconductor/actions/runs/43125214106), failed exactly four assertions about the pending name, parent, Browse and template controls. All four independent controls passed. The full suite reported 3,204 passed and four failed, with no skips or cancellations. [Retained assertion log](hosted-red.tap) and [job/build receipt](hosted-red.json) bind those observations to the baseline head.

The frontend job passed typecheck, then stopped at those same four unit failures before its build step. The separate [Keybindings build on the same head](https://github.com/reason-machines/openconductor/actions/runs/43125214125/job/130875446022) passed `npm run build`. These are intended behavioral failures, not import, setup or typecheck failures.

Fresh main `5852f41eb4df5c6da9b976d7b8ef830a892aed8d` still matches all five qualified source files. [Candidate source receipt](candidate-source.json) records that comparison. The product diff is exactly four removals of `disabled={pending}` from CreateProjectDialog. Primary pending, shortcut and duplicate-submit guards, captured invocation semantics, pipeline, validation, persistence, logging/error copy, close behavior, shared DialogFrame and the current Empty/Next.js template roster remain unchanged.

The sealed eight-case fixture remains byte-identical to the hosted baseline. Candidate GREEN and every exact-head workflow/check remain required before merge.

## Delivery limits

Static command: `python3 evidence/dialogs/create-project-pending-controls/verify_source.py`. It verifies identities only. No local Node, component/browser/native execution, installation, workflow dispatch or new watcher was run. No screenshot is available because this lane has no browser/native admission. Hosted mounted React proof will not establish native input, physical event delivery, picker behavior or visual parity. The strict physical acceptance gate remains unsatisfied and unwaived.

Publish this baseline ready against main. Never request or schedule its merge until every check and workflow on the exact repaired head is positively green. The owner retains the automatic PR subscription and consuming-main macOS package follow-through.
