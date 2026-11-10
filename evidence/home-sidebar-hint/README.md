# Home sidebar hint follows saved shortcuts

Conductor Rebuild owns HOME-HINT-271-01. The ledger cleared only the HomeScreen sidebar-toggle hint, its regression, and this evidence directory.

## Reference source

The existing artifact owner read Conductor 0.87.6 on Sven's authorized Mac without executing the target. [The received raw caller packet](reference-caller.json) preserves the complete `Gls` function, compiled JSX edge, hashes, offsets, and acquisition provenance. The exact renderer digest matches the retained shortcut resolver receipts.

`Gls` renders `p.jsx(Ss,{commandId:"view.toggleLeftSidebar"})` inside the hidden-sidebar toggle's tooltip. This is component construction, not a direct call to `Ss`.

The existing [focused receipt](../help/shortcut-overrides/reference-focused.json) and [transitive receipt](../help/shortcut-overrides/reference-transitive.json) close the rest of the chain:

- `Ss` renders `jde(commandId)`'s primary and additional keys.
- `jde` passes `Mde()` to imported `wYe`.
- `Mde` uses `useSyncExternalStore(q4r,WTn,WTn)` and parses the snapshot with `K4r`.
- Renderer imports and index exports join `wYe/q4r/WTn/K4r` to `OQt/SQt/bQt/zfe`.
- `OQt` calls `GUt` with the overrides. `GUt` calls `nh`, which prefers the command override over its defaults.
- `EUt`, `SQt`, `bQt`, and `jUt` wire settings hydration and subsequent storage notifications.
- The [same-build registry receipt](../keybindings/keybindings.json) marks `view.toggleLeftSidebar` configurable and records its default primary and additional keys.

[The retained provenance](../help/shortcut-overrides/reference-provenance.md) gives all helper ranges and limitations. `python3 evidence/home-sidebar-hint/verify-reference.py` checks the received caller span hashes, relative byte and UTF-16 offsets, helper lengths, alias joins, and command provenance without executing reference code. It does not reread or independently hash the original binary or full assets.

## Current source defect

Default main `8f88db182e0ea7ed20e0b612a6e111ba7f70dcc0` computes `TOGGLE_LEFT_SIDEBAR_HINT` at module load. That call omits the overrides argument, so it always uses the registry defaults. Moving that call inside render without supplying the provider snapshot would still be wrong.

Fresh default main `bd2d42c2a75bc2013cd447e78f07db01e25782dc` has an identical HomeScreen to that baseline. The correction consumes the existing `useKeybindingOverrides` context and calculates the hint during HomeScreen render. No provider, resolver, registry, Sidebar, AllWorkspaces, CSS, keyboard dispatch, or callback behavior changes.

## Regression and verification

`src/components/homeSidebarHint.test.ts` mounts the actual HomeScreen and actual KeybindingsProvider with the real parser, formatter, dispatcher, and listeners. Only unrelated decorative components are inert. In-memory EventTargets replace browser event targets. The test supplies a deferred settings read and drives the provider's public setter while keeping the Home element and parent props unchanged.

Six cases cover defaults and click dispatch, delayed primary/additional hydration, live edits/reset, single-key replacement, malformed-setting fallback, and hidden-toggle behavior. The existing Frontend CI job discovers this test through `node --test "src/**/*.test.ts"`. No workflow or dependency edits are needed.

### Hosted RED

The [automatic Frontend unit-test job](https://github.com/reason-machines/openconductor/actions/runs/42906887398/job/130147089470) ran `node --test "src/**/*.test.ts"` against regression-only head `19223fa976278f8669633e874bb7ec6c4ba7e113`, with HomeScreen unchanged. It passed 1,987 tests and failed exactly three. All failures were this regression's expected title mismatch:

- Persisted primary/additional hydration expected `Toggle left sidebar (⌘⇧Y or ⌥J)` but retained `Toggle left sidebar (⌘B or [)`.
- A live provider update expected the same saved pair but retained the defaults.
- A single saved shortcut expected `Toggle left sidebar (⌘⇧Y)` but retained the defaults.

Defaults/click dispatch, malformed-setting fallback, and the hidden-toggle case passed. This is behavioral RED, independent of the separate test-setup typing failure.

The [typecheck job](https://github.com/reason-machines/openconductor/actions/runs/42906887398/job/130147089444) also failed because a mutable optional `home.HomeScreen` property lost narrowing inside an async callback. The fixture now captures the component in an immutable local, validates it once, and uses that value for props and mounting. No test assertion was relaxed.

### Fix checkpoint

The next publication includes the provider-backed hint and the fixture typing correction. Automatic hosted GREEN is pending. `python3 evidence/home-sidebar-hint/verify-reference.py` and `git diff --check` passed after these edits. Local Node, tests, builds, browser/native execution, installation, manual workflow dispatch, and reruns are not admitted.

## Acquisition gaps and limits

The historical `Contents/Resources/app.asar` path returned ENOENT in the current app. A bounded 21-entry Resources inventory had no ASAR or standalone renderer. The sole artifact owner then used the authorized inert embedded-asset route. Brotli decompression produced the exact matching renderer digest without other transformation.

REA static inspection confirmed the executable digest but did not enumerate its embedded Tauri assets. The literal function is raw-bundle evidence, not a REA semantic graph or observed runtime behavior. No second shared-app reader was started.

No screenshot is available because browser and native execution remain excluded. Mounted hosted component tests do not establish native tooltip rendering, installed-app live updates, or side-by-side visual parity. The repository-tooltip alias candidate remains outside this repair. #847, #916, PID 54473, credentials, playground, bergen, and scratch state are unchanged.
