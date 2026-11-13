# UI program ledger: OpenConductor vs Conductor, screen by screen

## Current scope, 6 November 2026

The [generated interactive ledger](ledger.html) and [machine-readable map](../ui-map.json) are the current scope-aware evidence queue. Regenerate them with `python3 tools/ui-map/build_map.py`. The records below are historical audits, not current final-review sign-off.

- Local Home, sidebar, workspace and chat, composer, diff and changes, local Settings, Open in, palette, and dialogs remain in scope. Track D repeats fresh native side-by-side review after builders until a pass finds nothing material. Every current main-screen final verdict is unverified.
- Team, routines, triage, organization and other cloud UI are deferred and excluded from the denominator. Retained code must be hidden behind an Experimental setting that is off by default. The gate is a separate, currently unverified requirement. This scope change does not authorize deleting already merged implementation.
- Only Reason spans the Mac and a Reason cloud computer in one chat. Claude Code and Codex run locally on the Mac, with no cloud path or credential hand-off.
- Toast parity requires one verified system covering component, placement, timing and look, plus observable main-flow toasts. Unobservable errors are not missing requirements. Raw extracted strings and assessments remain in the map.
- The ledger owner exclusively edits aggregate maps, generator, side-by-side records and this ledger. Builders send area evidence and proposed verdicts instead of rewriting shared files.
- All current program Sessions use GPT-6.1 Sol at xhigh on `openai-codex:42b88e79-2ef2-4e3e-93b1-8c93dcad16a7`, with no paid fallback. Subscription limits pause inference rather than changing source. The older subscription history below is not current configuration.
- Cloud Team PR [#711](https://github.com/reason-machines/openconductor/pull/711) was closed without merge at `f8e284bc` by the coordinator, [closure record](https://github.com/reason-machines/openconductor/pull/711#issuecomment-6696223606). It was the only open PR returned by the initial reconciliation.

This rescore runs on Reason cloud and reuses checked-in REA captures from the real Conductor 0.87.6 binary, SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. It performs no new REA capture and introduces no new REA gap. Existing limitations remain in [REA-GAPS.md](../../tools/ui-map/REA-GAPS.md). Retained Chromium threshold matches do not prove current native parity. No real playground or workspace data is touched.

## Merged supplemental evidence, main `623b0936be1ebf430255c719dff4e1d04e7afeed`

[PR #722](https://github.com/reason-machines/openconductor/pull/722) adds [repository menu, sidebar and Home evidence](../../evidence/shell-actions/README.md). Only its repository-menu crop matches exactly. Home and sidebar remain partial. The selected Stone palette does not verify the default Neutral palette, and this browser fixture does not verify native macOS.

[PR #718](https://github.com/reason-machines/openconductor/pull/718) adds compact-footer layout and reveal proof, not native workspace sign-off. [PR #723](https://github.com/reason-machines/openconductor/pull/723) adds browser default-off and persisted opt-in proof, not native gate or signed-in Mac-to-cloud proof. Their raw crops, manifests, limitations and existing REA gaps stay in the linked area evidence.

[PR #725](https://github.com/reason-machines/openconductor/pull/725) adds [local dialog evidence](../../evidence/dialogs/NOTES.md): four fresh REA browser pairs and 12 passing isolated component checks. Its area remains partial. Archive's rejected reference capture, restore's static-only reference, fixture copy and palette differences, and native picker, filesystem and authentication gaps remain explicit. Earlier #682 and #690 proof is reused, not rerun.

The [supplemental manifest](supplemental-evidence.json) records these merges separately from the retained whole-state map. The generator includes it in JSON, Markdown and HTML without replacing state scores. The scoped totals remain 341 entries: 169 retained matches, 48 observed wrong, 3 observed missing and 121 unverified. All nine native final-review verdicts remain unverified. No new captures or REA gaps were introduced by this integration.

## Merge batch, 7 November 2026

Reconciled against main `a988e5a820e35ce41eb82856f8a1e7d20cd18594`. The [canonical evidence manifest](supplemental-evidence.json) and [generated ledger](ledger.html) now include merged #738–#745 and proof-only #746. This is a source reconciliation, not a new capture identity.

- #739 publishes the bounded composition fix-forward for the historical #735 Send-click defect. Synthetic composition does not establish real macOS IME safety.
- #740 terminal labels, #741 slider, #742 permission tokens, #738 discard alert and #745 Help styling have separate browser, source and packaging evidence. Native behavior and each retained area gap remain unverified.
- #744 consuming main passed all six workflows, including both E2E jobs. #746 publishes 18 proof-only files and fixture/driver corrections without repeating the product change. Its captures remain the original bounded #744 run. Group by is missing, with a partial REA semantic-graph trace rather than runtime proof.
- Sole E2E owner `acc3b5c5` confirms run `42317008433` on `50265ba2` passed both jobs and 23/23 App flows. The reported streak remains 0/10 because the newer run-number `42317638688` was cancelled. Later consuming results stay with that owner; no pending snapshot is treated as a pass.

The 341-entry scoped denominator, 169 retained matches, 48 wrong, 3 missing, 121 unverified and all nine native final-review verdicts are unchanged. Existing capture rows are not rescored. The earlier native source pin came from a driver note and its hold from the coordinator, not an independently verified immutable human ban. This Cloud-only batch performs no Mac launch/input, agent/credential operation, new preview, capture, CI dispatch or duplicate monitoring.

## Bounded synthetic WKWebView receipt, 7 November 2026

Conductor Rebuild reconciled the later [runtime-owner proof](https://reasonmachines.com/agents/d8e894e9-2c63-4ec3-9a11-f28722af996d?page=339835bf-57c3-46f5-825d-97167f31613f) against main `e9cfaed4a97a66bb495ca5a8b8f49aa6f0238094`. This adds no capture, score change or native final-review pass. The evidence is the owner's completed run, not a rerun by ledger integration.

- Runtime owner `d8e894e9` reports 10/10 synthetic WKWebView composition checks and 23/23 total assertions passed on Sven's Mac. The run ended at `2026-11-07T00:40:15.127Z` on source `50265ba211c5506a50180ad3f5dfa535183e1e98`, containing merged #739. Enter, Send, file and slash-suggestion blocking passed during synthetic composition. Post-composition `/clear` stayed local without agent delivery.
- The binary was a local debug rebuild with an ad-hoc signature, not a downloaded CI artifact. Its SHA256 is `d336711a992fc25e03c51299c4b949cfad20a7a6029ca2d49314087a4ae3c525`. The owner's retained archive SHA256 is `027471391e1739e335c33c16bb13409dcfc294070d6ac31dd2e09dad7ae2a9ea`. Ledger integration did not reopen the archive or inspect an image.
- Isolation and own-AppHandle nonce gates passed per owner, with zero sessions, messages or PTYs. Owned app `37126` and helper `37145` exited. The owner reports no residual handles or IP descriptors, and stable `54473` identity/hash unchanged before and after. Its later read-only audit confirmed both owned PIDs absent and the stable identity unchanged.
- Exact-window screenshot capture **failed** with `could not create image from window`. Two capture acknowledgements are not image passes. Real macOS IME, native visual parity, signed-in ACP and real-data cleanup were NOT RUN. No new Conductor/REA behavior is inferred.
- This source predates #740 merge `667ac60f` by one commit. Terminal labels/status, selected-worktree cwd, #741 slider rendering/drag/persistence and #742 colors/actions were NOT RUN. Containing #742 source does not prove its behavior. Earlier `8467` assertions and each package remain separate evidence.

All nine native full-parity verdicts remain unverified. Synthetic WKWebView assertions do not change the ten-run E2E streak, five-pass local verdict or real-auth verdict. Existing owners retain those checks. Ledger integration performed no Mac launch/input, new capture, preview or dispatch.

### Ledger #747 merge-gate gap

[PR #747](https://github.com/reason-machines/openconductor/pull/747) merged at `2026-11-07T00:56:46.75571Z` before all exact-head checks passed. The coordinator observed 14/16 successes with both E2E jobs running. Direct readback confirms Codex job `128244199775` completed later at `00:58:03Z`. The ALL-checks gate did not hold. Later success does not make that merge compliant. No post-merge cancellation or rollback is claimed. Future merge requests wait for every exact-head check and workflow to succeed.

## Grouping and Settings evidence, main `70bf6c5e`, 7 November 2026

Conductor Rebuild reconciled three newly merged increments on Reason Cloud. This updates the [canonical evidence manifest](supplemental-evidence.json) and generated JSON, Markdown and HTML, not the retained capture scores.

- [#748 Group by](../../evidence/sidebar-group/README.md) supersedes the historical missing-feature note. Its dark reference and both-theme fixture checks cover status/project grouping, counts/order, badges, filtering and mocked reload/collapse. Semantic coverage remains partial. Shortcut labels do not prove modifier-number activation; browser storage does not prove native database persistence.
- [#750 Reason defaults](../../evidence/settings/defaults-clear/README.md) retains three failing stale-handler schedules and one passing separate-render control before the correction, then all four passing after. The production-handler test uses invented in-memory IPC, not WebKit dispatch. The conditional defect is proven; attribution of the original #748 timeout remains unproven. Owner-reported 1,310 units and consuming fake-provider E2E are separate checks, not native or real-auth proof.
- [#751 final-source proof](../../evidence/sidebar-group/exact-head-after/README.md) retains eight REA captures and two filter screenshots inspected/published by the Home owner. Local tree `dbdc265e` equals final #748 head `e295f98f`, not a later consuming-main render or installed app. Its preview stop receipt is actual, with `01:48:58.673Z` only an upper-bound timestamp. Ledger integration read the manifests, not the images, and performed no recapture.
- Sole E2E owner `acc3b5c5` confirms consuming `1512/42327005025` on `154ba0da` and `1513/42327550939` on `70bf6c5e` each passed both jobs, eight late suites and 23/23 App flows. The latter artifact is `13556900481/results.json`; #751 consuming follow-through is closed. Its ordered-main streak is 7/10 after the `1499` cancellation reset. Active `1515/42329391407` is uncounted. This is attributed accounting, not a new independent pass or a native/five-pass/auth promotion.
- [The sole native owner's later receipt](https://reasonmachines.com/agents/d8e894e9-2c63-4ec3-9a11-f28722af996d?page=35fcabfb-811f-4210-b4a4-61c67f0b99d8) uses a local ad-hoc debug rebuild of `154ba0da`, not a CI artifact. It reports #741 synthetic native keys and computed slider geometry plus scratch-TOML readback after shutdown, not physical keys, pointer drag or restart persistence. Its final #742 driver passed 30/30 computed-token/synthetic Yes/No checks through the no-provider/stale-request false path, not active-agent option transport. The exact-window screenshot failed. Earlier partial drivers are not combined into a green suite; #739 was not rerun, and real IME/#740 tabs/cwd remain NOT RUN. Owned processes exited with stable app/source identity unchanged per owner. Ledger integration did not reopen the archive or launch the app.
- #752 Projects correction remains an unmerged receipt at this source snapshot. Browser sign-in remains the separately owned P0. Neither grants native parity credit. The existing coordinator Page is read-only here; source/data goes to its owner without another Page or status-only patch.

All 24 earlier evidence records remain retained alongside three merged increments and one bounded native receipt. Every raw/scoped row, exclusion, capture score, toast-system/main-flow requirement and default-off/native gate distinction is unchanged. The scoped denominator remains 341, with 169 retained matches, 48 wrong, 3 missing and 121 unverified. All nine final native reviews remain unverified. No product/driver edit, Mac launch/input, preview, dependency install, new worker, capture, dispatch/rerun or duplicate watcher occurred in this reconciliation.

## Visible-row shortcut evidence, main `dff4e7b0`, 7 November 2026

Conductor Rebuild reconciled merged [#757](https://github.com/reason-machines/openconductor/pull/757) on Reason Cloud. The [retained sidebar proof](../../evidence/sidebar-shortcuts/README.md) and [canonical manifest](supplemental-evidence.json) add one unique supplemental record; all 29 earlier records stay unchanged.

- The owner reproduced Meta+2 selecting hidden Lisbon instead of visible Osaka after custom Focus collapse. Six collapsed-section cases failed before, while six controls passed. The correction shares the existing session-local collapsed-section set. The owner reports 44 focused and 1,325 full units plus build/color checks passed after.
- Committed metadata retains 42 actual-key browser contexts and 162 activations across dark/light, Project/Status, three project filters and custom/status collapse. Out-of-range Meta+9 remains a no-op. The earlier animation-related driver failure and its corrected wait stay distinct from the product fix. Source hashes and actual preview-stop receipts are checked here; runtime assertions and image inspection remain owner-attributed.
- Home owner `27102e36` reports all four non-E2E consuming workflows passed on `0c088d05`, including package 39/39 and signature verification. Sole E2E owner `acc3b5c5` confirms [1529/42332253868](https://github.com/reason-machines/openconductor/actions/runs/42332253868), both jobs, late suites and artifact `13558368120/results.json` passed 23/23. Neither packaging nor fake-provider Ubuntu E2E proves native installation or real-auth behavior.
- The same E2E owner delivered the historical ten-green target through 1523, with 20/20 jobs and 230/230 flows validated by that owner. This integration does not recount or extend it. #754 consuming 1530 remains with its existing owner; no partial runtime result is promoted.
- Grounding reuses retained REA-decoded numbering evidence, not a fresh section-specific reference runtime capture. Before and after viewports differ; no pixel-distance match is claimed. Remapped modifiers, Pinned/My-workspaces container collapse, persisted native collapse, real authentication, actual IME and native side-by-side acceptance remain unverified. Five-pass failure and original #748 timing/causality remain separate gaps.

The 341-entry denominator, 169 retained matches, 48 wrong, 3 missing and 121 unverified are unchanged. Every raw/scoped row, exclusion, capture identity/score, observable main-flow toast/system requirement, default-off/native gate distinction and all nine unverified native verdicts are retained. No product/driver edit, Mac input, new capture, preview, dependency install, worker, dispatch/rerun or duplicate E2E watcher occurred. The parent-owned Page is read-only here; canonical source/data is sent to its owner.

## Open in / palette / menus lane, main `320255a7`, 13 November 2026

Conductor Rebuild reconciled remaining acceptance gaps in the Open in / palette / global menus SAME15 lane against current main `320255a797765393813a6acb2a613ad12eb489b5`. The two commits since the prior entry (`8ef5a2bb`) are docs-only (#1235) and terminal lane (#1232); neither touches Open in, palette or menus source. The prior source-coverage survey at `8ef5a2bb` is **still materially current** for in-scope source. No new unowned implementable gap was found. This pass performed no Mac launch, no native capture, no install/build, no runner or dispatch.

REA reference retained: renderer `5199d392` / index `b5b01f33` (Conductor 0.87.6, `ev_410f83a5…`). No new capture.

### Merged increments (source → CI green → behavioral)

| PR | Commit | Title | Cloud behavioral | Native |
|---|---|---|---|---|
| [#1205](https://github.com/reason-machines/openconductor/pull/1205) | `a66b72e9` | fix(open-in): launch the palette’s visible workspace file | NOT_RUN | NOT_RUN |
| [#1211](https://github.com/reason-machines/openconductor/pull/1211) | `d7595609` | fix(open-in): support icon menu Home and End keys | NOT_RUN | NOT_RUN |
| [#1217](https://github.com/reason-machines/openconductor/pull/1217) | `6acd4f8f` | fix(scripts): stop only the displayed Run task | NOT_RUN | NOT_RUN |
| [#1225](https://github.com/reason-machines/openconductor/pull/1225) | `7b46a3b9` | fix(open-in): focus icon menu rows on mouse movement | **12/12 PASS** (Cloud, `262f1915`, Session `15faf4d8`) | NOT_RUN |
| [#1226](https://github.com/reason-machines/openconductor/pull/1226) | `20d157d0` | fix(keybindings): close workspace tabs from Run and Setup output | NOT_RUN | NOT_RUN |

#1225 behavioral: 12-case pointer fixture (WebKit zero-motion guard, copy/cursor row focus, keyboard continuation, split-row preservation, app/copy click isolation). Source-only Cloud; no Tauri build, no Mac launch, no real Conductor comparison.

### Registered owner: OPEN-IN-SWITCHER-ENTER-POINTER

Publisher `a5387885` holds this unit. Source-qualified at commit `a5387885`; exact frozen-12 fixture preserved. Status: **behavioral NOT_RUN, native NOT_RUN**. Awaiting ACC existing-queue admission for matched local behavioral qualification before PR eligibility. No PR opened; no runner or allocation started by this lane. Switcher entry pointer gate is excluded from merged acceptance count.

### Remaining gap: MOVE-TO-SECTION-PALETTE

Owner: Conductor Rebuild / SAME15 (Session `15faf4d8`). REA-proven gap — Conductor’s compiled palette (`renderApp:5199d392`, spans `palette-5`, `palette-7`, `palette-8`) exposes a `Move to section` workspace action (`Jba` sub-view, `commandPalette.previousTab` wiring, `localWorkspaceId`/`sectionKey` props) that `workspacePaletteData` in `fromAppState.ts` explicitly omits (comment: “left out: workspace actions OpenConductor cannot run from here”).

Source pin drift `f3a52c4a` → `320255a7`: five affected files carry orthogonal changes (open-in types in `fromAppState.ts`, `activeOpenInTarget` prop in `PaletteHost.tsx`, minor refactor in `CommandPalette.tsx`, lifecycle update in `App.tsx`, persistence layer in `store.ts`). Gap contract holds at current main: `workspacePaletteData` returns no `move-to-section` entry; the `Jba` sub-view and `commandPalette.previousTab` → move-section path do not exist in OpenConductor. Preserved fixture: `moveToSection.test.ts.preserved` (SHA `93c3c03f`), 9 cases M01–M09 covering item exposure, section sub-view, dispatch, unpin and new-section return wiring.

Status: **source-requalified (orthogonal drift confirmed at `320255a7`), behavioral NOT_RUN, native NOT_RUN**. Requires ACC behavioral admission before PR eligibility. No runner started.

### Remaining gap: SECTION-PRIMARY-ACTION-6013

No publisher assigned. Source candidate prepared: `section-primary-action-6013/candidate.patch` (SHA `09c4cd16`), V3 optional-forwarding boundary in `SectionDialog` / `Modal`, 20-case frozen fixture. Status: **source-only candidate, behavioral NOT_RUN, native NOT_RUN**. Requires ACC direct admission for behavioral execution before PR eligibility. No runner started.

### Acceptance summary at `320255a7`

- Source-merged: 5 PRs (#1205, #1211, #1217, #1225, #1226); all CI-green at exact head.
- Behavioral-qualified (Cloud): #1225 only (12/12 PASS).
- Behavioral-qualified (native): none in this lane.
- Source-only/unqualified merged: #1205, #1211, #1217, #1226.
- Registered unmerged (external owner, ACC hold): OPEN-IN-SWITCHER-ENTER-POINTER (`a5387885`).
- Registered unmerged (this owner, ACC hold): MOVE-TO-SECTION-PALETTE (source-requalified, orthogonal drift confirmed).
- Unassigned source candidate (ACC hold): SECTION-PRIMARY-ACTION-6013.
- Unowned implementable gap: **none** at `320255a7`.

All nine native final-review verdicts remain unverified. No ledger denominator, score or supplemental row is changed.
## Historical program records

One row per node of Sven's UI audit program. A node is done when its side-by-side image
(real Conductor left, OpenConductor right, same window size; rules in
[side-by-side/README.md](../side-by-side/README.md)) shows it matching, and that image is linked
from a merged PR.

The coordinator's ledger owner maintains this file. Builder Sessions send evidence summaries with their Session id, PR numbers, proposed status and capture identity. The ledger owner integrates them after the relevant merge batch.

## Columns

- **Node**: the screen area. The slug in backticks is the `<node>` part of image file names.
- **Owner Session**: the child Session building the node (Session id), or `unassigned`.
- **PRs**: PRs for the node, newest last (`#123`, draft or merged).
- **Side-by-side status**: one of
  - `missing`: OpenConductor has no equivalent screen or control;
  - `wrong`: OpenConductor has it but it does not match Conductor;
  - `matches`: the latest side-by-side image shows no difference Sven would call out.
- **Last verified**: date and OpenConductor commit of the side-by-side image behind the status,
  linked to the image. `seed` means no side-by-side exists yet (see Seed below).
- **Source**: the Anthropic subscription source (`model_source_id`) of the program Sessions that
  built and verified the node, as `build: <source> (<session>); verify: <source> (<session>)`.
  `unrecorded` means Reason has no source for that Session; `n/a` means no program Session matches
  the node by feature name. See Subscription sources below.

## Nodes

| Node | Owner Session | PRs | Side-by-side status | Last verified | Source |
|---|---|---|---|---|---|
| Home `home` | unassigned | #457, #501 | wrong | seed | build: desktop-local-ffc7c778 (4b079fc3), oauth-cf0b3f60 (230e1ee8, #181), unrecorded (4bc9f043); verify: oauth-39b595c4 (680ef06f, errored), oauth-2791179c (4addd04f) |
| Sidebar `sidebar` | unassigned | #491, #505 | wrong | seed | build: desktop-local-ffc7c778 (da826963, 2a143f28), unrecorded (008a03c2); verify: oauth-8b4e0e0a (285aa125) |
| Header + title bar `header` | unassigned | #504, #514, #590, #586 | wrong | 2026-11-06, b3615ed, [header-01](../side-by-side/header-01-height-built-app-light.png) | n/a |
| Chat tabs + chat area + composer `chat` | unassigned | #516 | wrong | seed | build: desktop-local-ffc7c778 (098edd23), unrecorded (379d1c82); verify: oauth-cf0b3f60 (8eb44615) |
| Right panel: All files / Changes / Checks `right-panel` | unassigned | | wrong | seed | build: desktop-local-ffc7c778 (3530d46d, Diff viewer and review); verify: oauth-2791179c (0fa2bcc5, Diff viewer) |
| Setup / Run / Terminal strip `strip` | unassigned | #509 | wrong | seed | build: oauth-cf0b3f60 (4bf88c3a, Setup and run scripts), desktop-local-ffc7c778 (d3abaff9 Spotlight and run, e6d07b82 Terminal); verify: oauth-cf0b3f60 (30f21708) |
| Settings: Personal (General, Account, Appearance, Default models, Git, Ports) `settings-personal` | 396d0d00 (track B) | #644 | wrong | 2026-11-06, 841a805 + #644, [settings-personal-01](../side-by-side/settings-personal-01-search-branch.png) (harness render, does not count as matches) | build: desktop-local-ffc7c778 (2bc15518) |
| Settings: Agents & environment (Agents, Environment) `settings-agents-env` | unassigned | | wrong | seed | build: desktop-local-ffc7c778 (2bc15518) |
| Settings: Repositories (per repo: Environment, Git, Scripts, Actions, Misc) `settings-repos` | unassigned | | wrong | seed | build: desktop-local-ffc7c778 (2bc15518) |
| Settings: More (Experimental, Advanced) `settings-more` | unassigned | | wrong | seed | build: desktop-local-ffc7c778 (2bc15518) |
| Settings: Organization and Cloud (cloud org only) `settings-org` | unassigned | | missing | seed | n/a |
| Dialogs and menus `dialogs-menus` | 700983e1 (Help menu, Submit a prompt, Diagnostics) | #631 | wrong | 2026-11-06, 18ecd9590, [dialogs-menus-01](../side-by-side/dialogs-menus-01-help-menu.png) (harness render) | build: unrecorded (700983e1, Opus 5.5 high) |
| Toasts `toasts` | unassigned | | wrong | seed | n/a |
| Routines (Reason Loops) `routines` | d369b42f (Reason cloud features) | #685 | wrong | 2026-11-06, [routines-01](../side-by-side/routines-01-list.png), [routines-02](../side-by-side/routines-02-new.png) (harness render: t24 1.7% / 0.9%, does not count as matches; table and saved routine have no reference, the harness has no cloud organization) | build: unrecorded (d369b42f, Opus 5.5 high) |

Settings groups follow Conductor's settings navigation as read from its bundle
([evidence/settings/NOTES.md](../../evidence/settings/NOTES.md), "Settings pages"): Personal,
Agents & environment, Repositories, More. Conductor shows Ports and the Organization/Cloud pages
only for a cloud organization and redirects a local user to General; whether OpenConductor builds
them is the coordinator's call.

### Subscription sources

Sources from Reason's `sessions_get` for each program Session, read 2026-11-05. Probed the same day
with one Claude Opus 5.5 call at high effort each:

- **Working**, in round-robin order: oauth-8b4e0e0a, oauth-9de5292f, oauth-6a5827c3, oauth-4d2642bc,
  oauth-1fc002d7, oauth-e48d873d, oauth-86162253.
- **Failing**: oauth-39b595c4 (HTTP 403 `permission_error`: the plan does not allow Opus 5.5). Both
  errored Sessions (680ef06f Verify Home screen, 57144f93 Verify Reason ACP provider) ran on it.
- **No longer offered**: oauth-cf0b3f60, oauth-2791179c and desktop-local-ffc7c778 did earlier
  program work but are no longer offered as sources.

## What each node covers

Scope comes from Sven's decisions for the program; anything not listed is matched to Conductor
as-is.

- **Home**: Conductor's Home with the pixel wordmark in our name, three cards and the cities line;
  the sidebar's Home entry opens it.
- **Sidebar**: repo avatars, workspace rows with branch icons, `+N −M` counts, the FREE badge;
  the sidebar header is part of the window drag region.
- **Header + title bar**: breadcrumb `repo › branch ···` (repo avatar, chevron separator, overflow
  menu), the Open in button and its menu, the right-panel toggle at the far right; a drag region
  along the whole top (`data-tauri-drag-region` on the title-bar strip, sidebar header and main
  header, never on buttons).
- **Chat tabs + chat area + composer**: a tab per chat above the chat, a `+` with tooltip
  "New chat, same files ⌘T" and the ⌘T shortcut, several chats per workspace; transcript and
  composer as in Conductor.
- **Right panel**: tabs "All files", "Changes" with count badge, "Checks"; toolbar icons on the
  right (collapse tree, search, new file). File tree with folder and file-type icons, hover row
  highlight, expand chevron on hover, monospace names; files open through Open in, no in-app
  editor.
- **Setup / Run / Terminal strip**: collapsible strip under the right panel with tabs Setup, Run,
  Terminal, a `+` and a collapse chevron. Run's empty state is a dashed box "Run tests or a
  development server to test changes in this workspace" with an "Add run script" button. The
  bottom-of-workspace terminal stays removed; the terminal is a tab here.
- **Settings**: one node per page group above.
- **Dialogs and menus**: every dialog, sheet, context menu, popover and select (create project,
  clone, rename, keyboard shortcuts, account, workspace context, repo actions, model picker, help,
  command palette, Open in menu).
- **Toasts**: sonner toasts, their copy, placement and actions.
- **Across all nodes**: no blue accent. Active tab underlines, selected states, buttons (Run
  included), links, focus rings and the Open in icon tint are neutral black/grey, set once in the
  theme tokens, never per component.

## Seed

No side-by-side image exists yet, so every status above is a seed from
[parity/ui-map.md](../ui-map.md) (generated 2026-11-05 against OpenConductor `2e13137`) and Sven's
decisions. Those ui-map references are Conductor's extracted frontend rendered in Chromium on
Linux, not the native macOS app, and several PRs merged since (#471 file tree, #477 tool rows, #481
terminal strip), so a seed status is a starting point, not a verification. The first
side-by-side image for a node replaces its seed.

PRs merged before this table was added are listed in the PRs column from their titles on main;
their side-by-side images (for example `home-native.jpg`, `title-drag-region--workspace--light.png`)
and the per-screen verdicts of the final UI pass run 1 below predate the naming and window-size
rules, so the coordinator re-checks each before changing a seed status.

| Node | Seed basis |
|---|---|
| `home` | ui-map `home` wrong (copy 79%); `home-empty` matches, but the wordmark, cards and cities line are Sven's open asks |
| `sidebar` | ui-map `sidebar-after-archive` matches, but repo avatars, branch icons, `+N −M` and FREE badge are Sven's open asks |
| `header` | Sven's asks (breadcrumb, Open in, panel toggle, drag region); no ui-map state isolates the header |
| `chat` | ui-map `workspace-chat`, `workspace-new-chat`, `workspace-tool-calls` wrong; chat tabs partial per the 2026-11-05 parity re-review |
| `right-panel` | ui-map `diff-*` wrong; Sven's asks for tabs, toolbar and tree |
| `strip` | Sven's asks (Setup/Run/Terminal tabs, Run empty state, Run button not blue) |
| `settings-personal` | ui-map General, Account, Default models, Appearance wrong; Git matches; Ports missing |
| `settings-agents-env` | ui-map Agents, Environment wrong |
| `settings-repos` | ui-map repo Environment, Scripts, Actions, Misc wrong; repo Git matches |
| `settings-more` | ui-map Experimental, Advanced wrong |
| `settings-org` | ui-map: OpenConductor has no organization or cloud settings |
| `dialogs-menus` | ui-map dialog and menu states all wrong; 56 of 64 dialogs and 39 of 39 menus missing in the inventory |
| `toasts` | ui-map `toast-copied-link` wrong; 326 of 327 inventory toasts missing |

## Shell rows of the UI map (sidebar, header, Home, menus)

Builder `700983e1`, PR #631. Statuses come from [ui-map.md](../ui-map.md). The UI map's references are Conductor's extracted frontend, not the native window, so the images below are labelled "harness render". They do not count as `matches` for the `dialogs-menus` node above.

| UI map row | Before | After | Evidence |
|---|---|---|---|
| `menu-help` Help menu | wrong (10.4%, copy 70%) | matches (3.7%, copy 93%) | [dialogs-menus-01](../side-by-side/dialogs-menus-01-help-menu.png). Discord is left out on purpose (Conductor's own server). Conductor's version line also lists the Claude Code and Codex versions; ours shows only the app version. |
| `dialog-submit-prompt` (new), `dialog:submit-a-prompt` | missing | matches (2.4%, copy 100%) | [dialogs-menus-02](../side-by-side/dialogs-menus-02-submit-prompt.png). Submitting opens a GitHub issue instead of Conductor's feedback proxy. |
| `route-diagnostics`, `route:diagnostics` | missing | matches (0.7%, copy 100%) | [dialogs-menus-03](../side-by-side/dialogs-menus-03-diagnostics.png) |
| `diagnostics-run` (new) | n/a | wrong (3.4%, copy 83%) | [dialogs-menus-04](../side-by-side/dialogs-menus-04-diagnostics-run.png). It has no "Ask agent to analyze … report" buttons, which create a chat (chat team), and its env row is "OpenConductor app env". |
| `home` Home with projects | wrong (copy 79%) | wrong, measurement only | Conductor's sidebar Home row and ⌘⇧H both go to `/all-workspaces` (renderApp @10,030,267 and @10,928,888), as OpenConductor's do. The lane's `home` state clicks Home and so captures All workspaces, not `/`. The missing copy ("Open project", "Open GitHub project", "Quick start") is the `/` cards, which OpenConductor shows at its root view. `dialog-keyboard-shortcuts`, `menu-account` and `palette-*` miss the same three strings for the same reason: the lane opens them over a workspace instead of `/`. |
| `menu-account` Account menu | wrong (copy 73%) | unchanged | Missing copy beyond the `/` cards: "Log out" only. It ends Conductor's cloud session, and OpenConductor has none (`accountMenuModel.ts`). |

## Native references

Real-app captures from Sven's Mac belong under `evidence/screens/native/`. As of this table's first
commit that directory does not exist (the run 1 pass below used Sven's captures in
`~/oc-native-refs/` on his Mac, which are not committed); the only Conductor references in the repo are the
Chromium harness renders in [evidence/screens](../../evidence/screens) and
[parity/ui-map](../ui-map). Side-by-side images need the native app on the left (see the
side-by-side README).

## Final UI pass (run 1, after the batch merged up to #482)

**Build:** `~/OpenConductor-latest` (Developer ID signed, team 6N57FMKAZW), built from main `ff1dec619d85` ("evidence(parity): re-review chat/diff/PR on main 792cabb7 after #477", #482), built 2026-11-05T23:31Z. That is main's head, so no rebuild was needed.

**Setup:** a `ditto` copy of the signed app with only `CFBundleName`/`CFBundleDisplayName` set to `OCFinalPass` (so its window is distinguishable from the other OpenConductor instances running on the Mac) and re-signed ad hoc. It ran on a throwaway `HOME` under `/private/tmp/oc-fuip.*` with three fixture repos (tide-web, tide-api, dotfiles; bare origin + clone, one commit each), light theme, and a window of 1336×855, the same size as the running Conductor window. Sven's real HOME and repos were not touched. The real Conductor was not clicked or resized because it had live agent sessions running.

**Capture method:** `screencapture -l` failed with "could not create image from window" because this shell has no Screen Recording grant (`CGPreflightScreenCaptureAccess() == false`). OpenConductor was captured through Reason's Computer tool, which returns a 1280×819 window image. For Conductor I used Sven's native captures in `~/oc-native-refs/` and REA renders from `evidence/screens/`.

### Side-by-side images (Conductor left, OpenConductor right)

| Image | Conductor source | OpenConductor source |
|---|---|---|
| [home-empty-rea.jpg](../side-by-side/home-empty-rea.jpg) | REA render `home--empty-signed-in--light` | live, empty Home |
| [home-native.jpg](../side-by-side/home-native.jpg) | native `conductor-main.png` (Sven's real data) | live, empty Home |
| [workspace-native.jpg](../side-by-side/workspace-native.jpg) | native `conductor-workspace-filetree-run.png` | live workspace, Changes tab |
| [workspace-all-files-native.jpg](../side-by-side/workspace-all-files-native.jpg) | native `conductor-workspace-filetree-run.png` | live workspace, All files tab |
| [header-open-in-archive-misaligned.png](../side-by-side/header-open-in-archive-misaligned.png) | none (Sven's crop of ours, 3×) | the misalignment in question |

### Verdict per screen

| Screen | Verdict | What differs (owning node) |
|---|---|---|
| Title bar / window drag | **differs (likely broken)** | Every drag region uses `data-tauri-drag-region`, which calls `plugin:window\|start_dragging`. `src-tauri/capabilities/default.json` grants only `core:default`, and Tauri 2.12's `core:window:default` does **not** include `core:window:allow-start-dragging`. So every drag-region mousedown should be rejected by the ACL. A physical drag could not be produced from this session (see below), so this is source evidence, not an observed failure. (shell / title bar) |
| Home, empty | differs | Wordmark: Conductor shows its pixel-block wordmark; ours shows an app icon plus "OpenConductor" text, taller, pushing the cards about 20px lower. Card icons differ: Open GitHub project uses a globe in Conductor and a cloud in ours; Quick start uses a folder-plus in Conductor and a sparkle in ours. Conductor's sidebar empty state says "Add a project to get started."; ours lists repos with "No workspaces" under each (state difference from the fixture, not a defect on its own). (workspaces / home) |
| Sidebar | differs | Ours shows a "No workspaces" row under every empty repo, where Conductor shows the repo row with a count and nothing below. Ours also had a "Show hidden repositories" link while tide-web was hidden. Hover row with `…` and `+` matches in shape. Repo avatars: Conductor uses the GitHub owner avatar or a letter tile; ours uses a bare letter. (shell / sidebar) |
| Header and breadcrumb | differs | Conductor's breadcrumb is `repo › branch …` with a `›` chevron and a trailing `…` menu; ours is `repo / name` plus branch, target branch and status chips (`main`, `Idle`) that Conductor does not show in the header. Conductor has an Open-in split button plus a right-panel toggle; ours has the Open-in split button plus an **Archive** button. The Open-in split button and Archive button are vertically misaligned (Sven's crop). (shell / header) |
| Chat tabs | differs | Conductor's tab strip has a `+` new-tab button right after the tabs, with the tooltip "New chat, same files ⌘T" (Sven's native crop); ours has no `+` in the strip. Conductor's tab title is the chat title ("PDF Evidence Submission"), ours shows the workspace name. (chat / tabs) |
| Chat area and composer | differs | Composer shape, placeholder and `⌘L to focus` hint match. Model picker label format matches ("Opus 4.8 High" vs "GPT-5.6 Sol High"). Conductor shows a floating "Next unread ›" pill above the composer; not seen in ours (no unread state in the fixture, so unverified). The error line in ours ("Authentication required…") is a Reason agent sign-in error in the throwaway HOME, expected. (chat) |
| Right panel: All files | differs | Conductor's All files header has three icon buttons on the right (collapse all, search, open); ours has none. Conductor shows `Changes 0` with a count; ours shows `Changes` with no count. The tree rows (folder icon + mono name) match closely. (git-review / right panel) |
| Right panel: Changes | differs | Ours shows "All changes / Uncommitted" toggles and a Refresh button; empty-state copy "No changes on this branch yet." Not compared against a native Conductor Changes capture (none available). (git-review) |
| Right panel: Checks | not captured | Tab exists in ours; no Conductor reference available. |
| Setup / Run / Terminal strip | differs | Conductor's strip is `⌄ Setup Run Terminal +` with a collapse chevron, a Terminal tab and a `+`; its empty Run state is a dashed card "Run tests or a development server to test changes in this workspace" with an **Add run script** button. Ours is `Run  Setup •` (Run first, no Terminal tab, no `+`, no chevron), a disabled **▶ Run** button, "No run script configured", a "Use spotlight testing" checkbox and a monospace hint. Tab order, empty state and controls all differ. (terminal-scripts) |
| Settings pages | not captured | Navigation to Settings failed after the Computer tool's automation provider closed. Prior REA renders exist in `evidence/screens/settings--*`. |
| Dialogs and menus | partly checked | New workspace dialog opened and was closed. Right-click menus, popover menus and the 39 menus / 89 items in the UI map were **not** walked in this run. |
| Toasts | not captured | Conductor's native capture shows an update toast ("New update available" with See changes / Restart); no toast was triggered in ours. |
| Tooltips | partly checked | From the accessibility tree: ours has "Toggle left sidebar (⌘B)", "Go back (⌘[)", "Home (⌘⇧H)", "Create (⌘N)", "Search (⌘K)", "Settings (⌘,)", "Open in Finder (⌘O)", "Archive workspace". Conductor's new-tab tooltip "New chat, same files ⌘T" has no counterpart because ours has no `+` button. Delay and placement not measured. |
| Animations | not checked | Needs a screen recording, and none can be captured from this session. |
| Alignment: nav column | 256 px nav; Back 66.8×28 at (182, 6), 16 px icon, `px-1.5 py-1`; group title `px-2 py-1.5 text-xs` 28 px; link `gap-3 px-2 py-1.5` 32 px, icon x 14, text x 42, 14/20 | Was 220 px (an old styles.css rule beat settings.css), Back 60.8×22, titles 20 px, links gap 10 / pad 10, line-height normal. Now 256 px, Back 66.8×28 at (182, 6), icon 16, links gap 12 / pad 8, icon x 14, text x 42, 14/20 | **matches** ([align-nav.png](../side-by-side/settings/align-nav.png)) |
| Alignment: rows | Content x 296, h1 24/32 at y 64; controls right edge 1192; switch rendered inline in a block wrapper, 1.5 px above the row centre | Content x 260 → 296 (from the nav width); switch was 1.5 px lower than Conductor on every page, now the same wrapper layout and the same y (General, Git, Experimental measured) | **matches** ([align-switch-row.png](../side-by-side/settings/align-switch-row.png)) |
| Nav: account switcher + Search settings | "Ada Demo's Mac ⌄" switcher and "Search settings ⌘F" above Personal | not built | feature gap (not alignment) |

### Title-bar drag test

**Result: not proven. The source evidence points to a broken drag.**

- Reason's Computer tool drag (`from 700,40 → 600,140` on the header, and `140,18 → 40,118` on the sidebar top bar): the window stayed at 700,150. The tool reports that it posts mouse events to the process, which "cannot drive window-server drag sessions such as window moves", so this test cannot prove a drag works or fails.
- A CGEvent drag posted at the HID tap from the shell did nothing either: `AXIsProcessTrusted() == false`, so macOS dropped the synthetic events.
- Source: `core:window:allow-start-dragging` is missing from `src-tauri/capabilities/default.json`. A one-line fix adds it, then a person drags the window to confirm.

### Other findings from this run

1. **Launch crash when the bundle identifier changes.** A copy of the signed app re-signed ad hoc with `CFBundleIdentifier` changed panics in setup with `Failed to setup app: error encountered during setup hook: unknown path` (tauri `app.rs:1444`). The same copy with only the name changed launches. The crash also hits about one launch in five of a plain ad-hoc re-signed copy on a fresh HOME. It is likely `resource_dir()` → `StartingBinary` canonicalize, but that is not confirmed. Low user impact (a signed build launches), but it makes the e2e lane flaky on fresh HOMEs.
2. **Phantom workspaces in the fixture.** After registering three repos through `repositories.tsv`, the sidebar showed workspaces "S", "Sda" and "Yes" under tide-api, plus a chat whose first message was "s", and tide-web was hidden. None were created by this run. This could be state carried between launches of the same HOME, or a stray input; the cause is not confirmed.

### Screens captured vs not captured

- Captured live (OpenConductor): first-run onboarding, empty Home with sidebar, New workspace dialog, workspace view (header, chat tab, chat, composer, Changes, Run/Setup strip), All files.
- Not captured: Settings pages, Checks, Terminal, right-click menus, popovers, toasts, animations, and every live Conductor screen (no Screen Recording; the live Conductor window was left alone).

## Final UI pass (run 2, main `0b89bf8`, 2026-11-06)

**What ran.** Every state in [tools/ui-map/states.json](../../tools/ui-map/states.json) on both sides, regenerated end to end on a Reason cloud computer: Conductor 0.87.6's frontend decoded from the real binary on sven m5 max (sha256 `0ba55751…831d`) and rendered by REA `capture-browser-scenario` (REA 6.8.0 on the cloud computer); OpenConductor built from `0b89bf8` (`npx tauri build --debug --no-bundle`) and driven by tauri-driver under Xvfb, 1280×820, dark theme, fixture HOME; REA `compare-web-screenshots` at thresholds 0 and 24; `build_map.py`. 65 reference captures, 44 OpenConductor captures plus 3 that stopped at a step, 47 diffs. The full regenerated map is [parity/ui-map.md](../ui-map.md); what the map cannot see (native menu bar, native dialogs, gated pages and why) is in [parity/ui-map-coverage.md](../ui-map-coverage.md).

**Totals** (states and inventory items; `c3c7b31` in brackets): 963 entries, 781 missing (780), 137 wrong (160), 45 matches (23). States: 22 missing, 38 wrong, 5 match. Settings rows matching went from 11 to 30.

**Since run 2.** Main has regenerated the map after this pass (#578, #580 and later), so [parity/ui-map.md](../ui-map.md) and its JSON now carry a newer OpenConductor commit and newer totals than the table below; this section and the diff images in [parity/ui-map/diff/](../ui-map/diff/) stay the dated record of `0b89bf8`. When this branch was brought up to date with main (merge of `1255f7f`), the generated map files were taken from main unchanged.

**What these images are.** The left side of each diff is Conductor's own frontend in Chromium with mocked IPC and synthetic data, not the native window, so these are not side-by-side images under [side-by-side/README.md](../side-by-side/README.md) and do not change any node's seed status above. Seed data differs between the sides (the reference has six workspaces and a transcript, OpenConductor one fresh worktree), so pixel ratios include content differences. Background tone differs on every screen because OpenConductor uses the Neutral grading Sven chose; that is intended, not a finding. The diff and side-by-side JPGs are committed under `parity/ui-map/diff/`; the raw PNGs are not.

### Ledger: every screen

| Screen | Status | Was (`c3c7b31`) | t24 | Copy | Missing from OpenConductor (first 4 of Conductor's strings) | Evidence |
|---|---|---|---:|---:|---|---|
| Onboarding, signed out `onboarding-signed-out` | **wrong** | wrong | 99.3% | 86% | "privacy" | [diff](../ui-map/diff/onboarding-signed-out.jpg) |
| First-run onboarding `first-run-onboarding` | **wrong** | wrong | 96.8% | 7% | - | [diff](../ui-map/diff/first-run-onboarding.jpg) |
| Home, no projects `home-empty` | **matches** | matches | 3.5% | 93% | "view pricing" | [diff](../ui-map/diff/home-empty.jpg) |
| Home with projects `home` | **wrong** | wrong | 4.3% | 73% | "open project"; "open github project"; "quick start"; "view pricing" | [diff](../ui-map/diff/home.jpg) |
| All workspaces list `all-workspaces` | **matches** | matches | 1.1% | 92% | "view pricing" | [diff](../ui-map/diff/all-workspaces.jpg) |
| Create workspace composer `create` | **wrong** | wrong | 8.6% | 77% | "open project"; "open github project"; "quick start"; "select repo" | [diff](../ui-map/diff/create.jpg) |
| Create: repo picker open `create-repo-picker` | **wrong** | wrong | 8.9% | 78% | "open github project"; "quick start"; "select repo"; "add project" | [diff](../ui-map/diff/create-repo-picker.jpg) |
| Workspace: chat transcript `workspace-chat` | **wrong** | wrong | 6.1% | 82% | "next unread"; "view pricing"; "copy final message"; "show message actions" | [diff](../ui-map/diff/workspace-chat.jpg) |
| Workspace: new empty chat `workspace-new-chat` | **wrong** | wrong | 3.6% | 88% | "add chat transcripts"; "next unread"; "view pricing" | [diff](../ui-map/diff/workspace-new-chat.jpg) |
| Chat: tool calls expanded `workspace-tool-calls` | **wrong** | wrong | 7.4% | 83% | "next unread"; "view pricing"; "copy final message"; "show message actions" | [diff](../ui-map/diff/workspace-tool-calls.jpg) |
| Diff: file, unified `diff-unified` | **wrong** | wrong | 11.2% | 88% | "archive workspace"; "view pricing"; "copy file contents"; "filter files" | [diff](../ui-map/diff/diff-unified.jpg) |
| Diff: file, split `diff-split` | **wrong** | wrong | 11.3% | 88% | "archive workspace"; "view pricing"; "copy file contents"; "filter files" | [diff](../ui-map/diff/diff-split.jpg) |
| Diff: entire file `diff-entire-file` | **wrong** | wrong | 5.8% | 88% | "archive workspace"; "view pricing"; "copy file contents"; "filter files" | [diff](../ui-map/diff/diff-entire-file.jpg) |
| Workspace needing permission `needs-permission` | **missing** | missing | n/a | n/a | - | the OpenConductor seed has no workspace with a pending permission request |
| Dashboard `route-dashboard` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /dashboard |
| Routines `route-routines` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /routines |
| New routine `route-routines-new` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /routines/new |
| Team `route-team` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /team |
| Diagnostics `route-diagnostics` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /diagnostics |
| New member onboarding `route-new-member-onboarding` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /new-member-onboarding |
| Cloud collaboration onboarding `route-cloud-collab-onboarding` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /cloud-collab-onboarding |
| Login `login` | **missing** | missing | 99.3% | 0% | "sign in to continue"; "privacy" | [diff](../ui-map/diff/login.jpg) |
| Settings > General `settings-general` | **wrong** | wrong | 3.3% | 89% | "enter"; "chime"; "account menu"; "search settings" | [diff](../ui-map/diff/settings-general.jpg) |
| Settings > Account `settings-account` | **wrong** | wrong | 5.0% | 73% | "linear"; "connect linear so conductor can use issu"; "billing"; "manage your conductor plan and payment d" | [diff](../ui-map/diff/settings-account.jpg) |
| Settings > Default models `settings-models` | **wrong** | wrong | 4.8% | 71% | "loadout"; "choose which models you want to use"; "share"; "empty" | [diff](../ui-map/diff/settings-models.jpg) |
| Settings > Agents `settings-providers` | **wrong** | wrong | 10.0% | 83% | "authentication"; "cli"; "account menu"; "search settings" | [diff](../ui-map/diff/settings-providers.jpg) |
| Settings > Environment `settings-environment` | **wrong** | wrong | 3.0% | 86% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-environment.jpg) |
| Settings > Git `settings-git` | **matches** | matches | 4.8% | 92% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-git.jpg) |
| Settings > ports `settings-ports` | **missing** | missing | n/a | n/a | - | OpenConductor's settings have no ports page |
| Settings > Appearance `settings-appearance` | **wrong** | wrong | 6.0% | 89% | "active"; "function sum(a, b) { return a + b; }"; "account menu"; "search settings" | [diff](../ui-map/diff/settings-appearance.jpg) |
| Settings > Keyboard shortcuts `settings-key-bindings` | **wrong** | wrong | 5.2% | 37% | - | [diff](../ui-map/diff/settings-key-bindings.jpg) |
| Settings > Experimental `settings-experimental` | **matches** (changed) | wrong | 3.4% | 95% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-experimental.jpg) |
| Settings > Advanced `settings-advanced` | **wrong** | wrong | 7.4% | 88% | "account menu"; "search settings"; "search settings shortcut"; "browse for executable" | [diff](../ui-map/diff/settings-advanced.jpg) |
| Settings > Big terminal `settings-terminal` | **missing** | missing | 3.2% | n/a | - | [diff](../ui-map/diff/settings-terminal.jpg) |
| Settings > internal `settings-internal` | **missing** | missing | n/a | n/a | - | OpenConductor's settings have no internal page |
| Settings > tide-web > Environment `settings-repo-environment` | **wrong** | wrong | 2.7% | 88% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-environment.jpg) |
| Settings > tide-web > Git `settings-repo-git` | **matches** | matches | 3.6% | 91% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-git.jpg) |
| Settings > tide-web > Scripts `settings-repo-scripts` | **wrong** | wrong | 3.5% | 67% | "commands that run when workspaces are se"; "runs before a workspace is archived"; "run scripts"; "shortcuts for quick actions, like runnin" | [diff](../ui-map/diff/settings-repo-scripts.jpg) |
| Settings > tide-web > Actions `settings-repo-actions` | **wrong** | wrong | 6.1% | 74% | "fix errors preferences"; "add custom instructions sent to the agen"; "resolve conflicts preferences"; "add custom instructions sent to the agen" | [diff](../ui-map/diff/settings-repo-actions.jpg) |
| Settings > tide-web > Misc `settings-repo-misc` | **wrong** | wrong | 6.2% | 92% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-misc.jpg) |
| Settings > tide-web > Misc, scrolled to Remove repository `settings-repo-misc-lower` | **wrong** | wrong | 6.4% | 92% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-misc-lower.jpg) |
| Settings > Organization > github `settings-org-github` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > members `settings-org-members` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > preferences `settings-org-preferences` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > computer `settings-org-computer` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > environment `settings-org-environment` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > mcp `settings-org-mcp` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > prompts `settings-org-prompts` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Cloud setup `settings-cloud-setup` | **missing** | missing | n/a | n/a | - | OpenConductor has no cloud settings |
| Settings search `settings-search` | **missing** | missing | 4.7% | n/a | - | [diff](../ui-map/diff/settings-search.jpg) |
| Command palette `palette-all` | **wrong** | wrong | 6.9% | 47% | "add project"; "toggle theme"; "toggle zen mode"; "send feedback" | [diff](../ui-map/diff/palette-all.jpg) |
| Command palette: Workspaces tab `palette-workspaces` | **wrong** | wrong | 23.0% | 77% | "open project"; "open github project"; "quick start"; "all projects" | [diff](../ui-map/diff/palette-workspaces.jpg) |
| Command palette: search `palette-search` | **wrong** | wrong | 17.5% | 76% | "open project"; "open github project"; "quick start"; "navigation" | [diff](../ui-map/diff/palette-search.jpg) |
| Clone GitHub repo dialog `dialog-clone-github` | **wrong** | wrong | 5.0% | 76% | "open project"; "open github project"; "quick start"; "choose a recent repo or paste a clone ur" | [diff](../ui-map/diff/dialog-clone-github.jpg) |
| Create project dialog `dialog-create-project` | **wrong** | wrong | 7.7% | 80% | "open project"; "open github project"; "quick start"; "gstack" | [diff](../ui-map/diff/dialog-create-project.jpg) |
| Rename workspace dialog `dialog-rename-workspace` | **wrong** | wrong | 4.3% | 74% | "open project"; "open github project"; "quick start"; "archive workspace" | [diff](../ui-map/diff/dialog-rename-workspace.jpg) |
| Keyboard shortcuts dialog `dialog-keyboard-shortcuts` | **wrong** | wrong | 5.7% | 73% | "open project"; "open github project"; "quick start"; "view pricing" | [diff](../ui-map/diff/dialog-keyboard-shortcuts.jpg) |
| Account / computer menu `menu-account` | **wrong** | wrong | 7.3% | 69% | "open project"; "open github project"; "quick start"; "log out" | [diff](../ui-map/diff/menu-account.jpg) |
| Workspace context menu `menu-workspace-context` | **wrong** | wrong | 6.1% | 79% | "open project"; "open github project"; "quick start"; "view pricing" | [diff](../ui-map/diff/menu-workspace-context.jpg) |
| Workspace context menu > Set status `menu-workspace-status` | **wrong** | wrong | 7.5% | 75% | "open project"; "open github project"; "quick start"; "archive workspace" | [diff](../ui-map/diff/menu-workspace-status.jpg) |
| Composer model picker `menu-model-picker` | **missing** (changed) | wrong | 10.3% | n/a | - | [diff](../ui-map/diff/menu-model-picker.jpg) |
| Sidebar repo actions menu `menu-repo-actions` | **wrong** | wrong | 5.4% | 73% | - | [diff](../ui-map/diff/menu-repo-actions.jpg) |
| Help menu `menu-help` | **wrong** | wrong | 10.3% | 67% | "open project"; "open github project"; "quick start"; "discord" | [diff](../ui-map/diff/menu-help.jpg) |
| Toast: copied link `toast-copied-link` | **wrong** | wrong | 5.7% | 69% | "open project"; "open github project"; "quick start"; "archive workspace" | [diff](../ui-map/diff/toast-copied-link.jpg) |
| Sidebar after archiving a workspace `sidebar-after-archive` | **wrong** (changed) | matches | 4.3% | 88% | "archive workspace"; "view pricing" | [diff](../ui-map/diff/sidebar-after-archive.jpg) |


### Status changes since `c3c7b31`

- `settings-experimental` wrong → **matches** (t24 4.9% → 3.4%, copy 88% → 95%).
- `sidebar-after-archive` matches → **wrong**: copy fell below 90% because "archive workspace" (the row's archive tooltip/label) and "view pricing" (the FREE badge) are not on OpenConductor's screen. Pixels unchanged (4.3%).
- `menu-model-picker` wrong → **missing**: a lane artefact plus a real difference. Since #561 the composer chip reads "Opus 4.8 High" (Settings › Default models default `opus`), while Conductor's reads "Opus 5", so the lane's `"Opus 5"` click matches nothing and the menu never opens.

### Native pass on the Mac (not completed)

- **Conductor, real window:** REA `observe-native-ui` refused (`screen-recording-denied`; REA-GAPS 26). The live Conductor had a running agent, so it was not clicked. The only native Conductor references remain Sven's captures in `~/oc-native-refs/` (6 Conductor images; `conductor-main.png` and `conductor-settings-general.png` are the same file, sha256 `552d17f4…`, so there is no native Settings reference).
- **OpenConductor, built app:** the CI build of `0b89bf8` (`~/OpenConductor-ci-0b89bf84`, ad-hoc signed) was copied as `OCFinalPass2` on a throwaway HOME with three fixture repos and captured once through Reason's computer tool (Home with sidebar, light theme). The rest of the walk failed: the Mac's load average was 88 on 18 cores from other Sessions' builds, computer use returned a run of transient errors, and a later snapshot resolved to another Session's OpenConductor window with the same bundle id, so the run stopped there rather than click in someone else's app (reported to the Reason team). The copy was quit and left in `~/ocfp-75177d01`.
- **Launch crash, again:** the first copy, run from `/tmp`, panicked in setup with `Failed to setup app: error encountered during setup hook: unknown path` (tauri `app.rs:1444`), the crash run 1 recorded; the same bundle moved under `~` launched. That points at `/tmp` → `/private/tmp` canonicalisation of the resource dir, not at the identifier change run 1 suspected; not confirmed.

### Gaps found in this pass (owning node)

1. **Native menu bar** (`header` / shell): 7 of 8 Help items, Check for Updates, Settings... (⌘,), custom Quit and Window › Close Window are missing. Diagnostics... routes to `/diagnostics`, which OpenConductor does not have. ([coverage §1](../ui-map-coverage.md))
2. **`/diagnostics` page** (shell): reachable by every Conductor user from Help; missing.
3. **Big terminal placement** (`settings-more`): Conductor appends the tab to the last group (More, after Advanced); OpenConductor shows it as a separate untitled group.
4. **Keyboard shortcuts settings page** (`settings-personal`): Conductor shows it only to internal users; OpenConductor lists it for everyone.
5. **Default model chip** (`chat`): "Opus 4.8 High" vs Conductor's "Opus 5".
6. **Home with projects** (`home`): OpenConductor's Home turns into a workspace list ("Today", search, Create workspace) once a workspace exists; Conductor keeps the wordmark, three cards and the cities line ([diff](../ui-map/diff/home.jpg)). Wordmark, card icons (globe vs cloud, folder-plus vs sparkle), cities line and FREE badge still differ ([diff](../ui-map/diff/sidebar-after-archive.jpg)).
7. **Command palette** (`dialogs-menus`): opens anchored to the top of the main pane at a different width; Conductor centres it over the window (t24 23.0% for the Workspaces tab, [diff](../ui-map/diff/palette-workspaces.jpg)).
8. **Workspace header** (`header`): Conductor shows `repo › branch ···`, the Open in split button, a PR status and the right-panel toggle; OpenConductor shows `repo / name` with branch chips ([diff](../ui-map/diff/workspace-chat.jpg)).
9. **Harness gaps that keep states unverified** (tools/ui-map): seed `experimental_big_terminal_mode = true` for `settings-terminal`; a not-yet-onboarded seed for `first-run-onboarding`; a DOM-dispatched click for `menu-repo-actions`; update the `menu-model-picker` selector; `settings-search` has no search input in OpenConductor (a real missing control: Conductor's "Search settings ⌘F"). 686 of 898 inventory items are still on no captured screen.

## Settings (repo + user settings)

Scope: user Settings (General, Account, Appearance, Agents, Models, Git, Environment, Experimental, Advanced) and repo Settings (Git, Environment, Scripts, Actions, Misc), shared Settings chrome only for Scripts and Actions. Reference: Conductor 0.87.6's frontend decoded from `/Applications/Conductor.app/Contents/MacOS/conductor` on sven m5 max (sha256 `0ba55751…831d`, 2,902 assets, `tools/extract_tauri_assets.py`), served by `tools/screens` and rendered in Chromium beside OpenConductor's build. Measurements use playwright-core because REA cannot hover (tools/ui-map/REA-GAPS.md 17-19). Images: [parity/side-by-side/settings/](../side-by-side/settings/).

| Item | Conductor (verified) | OpenConductor | Status |
|---|---|---|---|
| Tooltip: Back | "Esc", `side:"right"`, Root `delayDuration:100` (`I9a`); live: opens after ~115 ms, 36×24 at 4 px right of the button, fade + scale from 95% over 100 ms | Same text, side, delay and box (opens after ~103 ms) through the shared `Tooltip` (`delay` prop added) | **matches** ([back-tooltip.png](../side-by-side/settings/back-tooltip.png)) |
| Tooltip: Account › Linear Connect, Billing | "Opens settings in your browser", "Opens billing in your browser" (600 ms, top) | No Linear or Billing card (no Conductor account service) | n/a until those cards exist |
| Right-click: settings nav links | Every page link (user pages and repo sections): one item, copy icon + "Copy link", copies `<scheme>://settings/<path>` (`t9a`, `TGt`); menu 128×40 at pointer +2 px, item 32 px, 16 px muted icon. REA Evidence `ev_c20f4c8e…` (right-click through `capture-browser-scenario`) | Same item, icon, size and offset; copies `openconductor://settings/user/<page>` or `…/repos/<id>/<section>`, toast "Copied link to clipboard" | **matches** ([nav-copy-link-menu.png](../side-by-side/settings/nav-copy-link-menu.png)) |
| Right-click: links in row text | "Open link" (external-link icon), "Copy link" (copy icon), no separator (`Q$r`, `X$r` for any `<a>` whose href has a scheme); 128×72 at the pointer, 5 px up | Same items, order, icons and placement, on every link inside Settings | **matches** ([row-link-menu.png](../side-by-side/settings/row-link-menu.png)) |
| Press state: buttons | `REe`: `transition-transform duration-150 ease-out` (cubic-bezier(0,0,.2,1)), `active:scale-[0.97]`, reduced motion keeps scale 1; ghost hover `bg-sidebar-accent` (#ffffff0d dark), instant | Settings `.btn`: same transition, scale .97 on `:active`, reduced-motion guard; Test button gets the ghost hover. Measured: both at scale 0.97 when `:active` | **matches** ([button-press.png](../side-by-side/settings/button-press.png)) |
| Transitions: switches, Back | Switch track `transition-colors duration-150`, thumb `transition-transform duration-150` (cubic-bezier(.4,0,.2,1)); Back `transition-colors` 150 ms | Same durations and easing (were `ease`) | **matches** |
| Transitions: nav links, comboboxes | none (`all 0s`) | none | matches |
| Alignment | Back: 28 px tall, right edge 6 px inside the 256 px nav; account switcher and "Search settings" above the groups | Back 22 px tall and 40 px further left; no account switcher or search | open: PR (d) |

## Track B: UI detail program (UI map rounds)

Owner: Session 396d0d00 (track B). One node per UI map screen; each round fixes the shared
differences that move the most states first, then screen by screen. Every count below is a full
UI map run on a Reason cloud computer: Conductor 0.87.6's frontend decoded from the real binary on
sven m5 max (sha256 `0ba55751…831d`, copied with Reason's device copy) and captured with REA 6.8.0
`capture-browser-scenario`; OpenConductor's debug build driven by `tools/ui-map/oc_lane.mjs`
under Xvfb; REA `compare-web-screenshots`; `tools/ui-map/build_map.py`. The committed
[ui-map.md](../ui-map.md) says 54 at `4d67e995d`; the baseline below is the same pipeline re-run on
main `841a805`.

| Round | OpenConductor | Matches / 963 | Missing | Wrong | States matching (of 65) | What moved it |
|---|---|---:|---:|---:|---:|---|
| baseline | main `841a805` | 61 | 778 | 124 | 8 | (none) |
| B1 | `841a805` + #644 (first commit) | 89 | 777 | 97 | 12 | Settings nav: account switcher and "Search settings ⌘F" above the groups (11 settings states were missing "account menu", "search settings", "search settings shortcut"); Big terminal in More |
| B2 | `841a805` + #644 (merged) | 103 | 776 | 84 | 13 | 32 px Input and outline Button, path fields ("Browse for executable", "Browse for SSH key"), SSH key as a bare block, RadioGroup circles: Advanced and Git match |
| B3 | main `56e96e7` + #653 | 100 | 779 | 84 | 14 | Repo Misc: placeholders muted, warning line as a block with lucide circle-alert, "Learn more" arrow-up-right, refresh-cw in a 24 px button: both Misc states match. Main's #640 removed the OpenCode executable row, so Advanced is back to wrong (6.3%: the reference still has the row) |

### Track B nodes

| Node (UI map states) | PRs | Status (UI map) | Open differences |
|---|---|---|---|
| Settings chrome (all `settings-*`) | #644, #653 | General, Models, Environment, Git, Experimental, repo Environment, Git, Scripts, Actions, Misc (both), Settings search match | Account (Linear, Billing, Sign out cards: no Conductor account service), Appearance (code preview "function sum"), Advanced (OpenCode row removed on purpose by #640), Agents (track A owns) |

### REA gaps hit by track B

30. **`capture-browser-scenario` cannot read a row registry's search terms.** Conductor's settings
    search indexes each row's `searchTerms` and its repository prompt rows (`S6e`); neither is in
    `evidence/settings/settings-registry.json` (a regex over one call shape), and REA has no query
    for "the arguments of every call to function X" in a JavaScript chunk (REA-GAPS 14, 17, 25,
    28). `tools/settings/extract_settings_rows.py` reads the `ir({...})` and `S6e({...})` calls as
    text, with their order in `fUi`, into `evidence/settings/settings-search-rows.json`.
32. **Lane fixture reuse (not REA):** `oc_lane.mjs` keeps its seeded HOME template across runs when `UIMAP_RUN` is reused; after a full run, the archive state leaves the template's worktree gone, so later runs fail every diff state with "not a git repository … worktrees/montreal". Delete `UIMAP_RUN` before each full run.
31. **The UI map's Linux lane needs WebKit's helper processes at a hard-coded `/usr/lib` path.**
    Not a REA bug: on a Reason cloud computer without root, WebKitGTK from a sysroot fails with
    "Unable to spawn … WebKitNetworkProcess"; the lane runs under `unshare -rm` with the sysroot's
    `/usr/lib/x86_64-linux-gnu` and `/usr/share` overlaid.

## Track C: responsiveness and transitions (transition lab)

Owner: Session 818a22cc (track C). Click to content for every screen switch in the built app,
cold and warm, against Conductor 0.87.6; full numbers, filmstrips and commands in
[side-by-side/transitions/timing](../side-by-side/transitions/timing/README.md).

| Area | PRs | Status | Measured (built app, median content ms; loader on screen) | Open |
|---|---|---|---|---|
| Workspace switch, Home to workspace, Settings › Back | #636 | matches: no loader, no flip, one-frame swap like Conductor's cached `useFilesChanged` | 13 to 35 ms (main `841a805`: 101 to 203 ms, "Loading changes…" 56 to 696 ms, wrong list for one frame) | a workspace never opened since launch still shows "Loading changes…" until git answers, as Conductor does |
| Right panel tabs (All files, Changes, Checks) | #636 | matches: instant | 2 to 8 ms warm; first All files after launch 46 ms with its loader | none |
| Panels (⌘B, ⌥⌘B, ⌘J) | (none needed) | matches: instant, layout shift 0 | 5 to 55 ms | none |
| Dialogs (⌘K, ⌘P, ⌥⌘/, ⌘N, confirmations) | #605 (motion), #636 (measured) | matches: Conductor's durations and easing | open 13 to 51 ms; ⌘K exit 135 to 142 ms vs Conductor 141 to 144 | none |
| Settings open and page switch | #636 | matches: no "Loading…" frame, no shift on open, Environment, Misc or Default models | 5 to 47 ms; Appearance cold 73 to 148 ms in both builds (code preview highlight) | Appearance first mount |
| Window sizes 900, 1280, 1600, 2100 | #584, #591 (layout), #636 (checked) | matches: same boxes as Conductor within 1 px, no overflow | n/a | visual details in the sheet are track B's |

### REA gaps hit by track C

1. `analyze-javascript-application` (6.8.0) keeps bindings (`K9t`) but not object-pattern property
   names or option objects, so a hook's query options cannot be read from its evidence; 3 min 9 s
   and 125 MB of evidence for one 3.5 MB chunk.
2. `inspect-analysis-view` documents only `{inputJson}`; no way to search an evidence bundle for a symbol.
3. `capture-browser-scenario` forces reduced motion and has no per-frame sampling (as in #605), so
   timing came from frame logs and the Xvfb recording; the native Conductor window was not measured.

## Dialogs lane reconciliation, main `327277f40`, 13 November 2026

Conductor Rebuild reconciled all `evidence/dialogs/` directories against current main `327277f40f4c97e77a8f5fc91e9fd32e1b7f3f73`. No Mac launch, native capture, install, build, runner or dispatch. Static fixture-SHA and product-source sweep only.

### Gaps verified already on main

All previously-evidenced dialogs product corrections are present on main: `clone-url-text-correction`, `clone-pending-inputs`, `clone-basename-normalization`, `clone-recent-pending-selection`, `section-name-input`, `section-write-errors`, `section-composition-escape`, `create-project-pending-controls`, `linked-picker-boundary-keys`, `picker-location`, `rename-branch-pending`, `reset-chat-focus`, `reset-chat-dismissal`, `reset-chat-pending-indicator`, `quit-focus`, `quit-dismissal`, `github-owner-retry`, `github-repo-dismissal`, `github-fallback-integration`, `github-name-empty`, `github-orgs-fallback-source`, `github-owner-fallback-source`, `remove-pending-dismissal`, `restore-pending-dismissal`, `submit-prompt-rejection`, `workspace-launch-close`, `rename-chat-focus`, `rename-chat-lifecycle`.

### Remaining unimplemented dialogs source candidate: CONFIG-SYNC-PENDING-SELECTION

Owner: Conductor Rebuild (this Session). `ConfigSyncDialog.tsx` lines 90 and 107 disable category and item checkboxes when `state.kind !== "ready"`, blocking selection during `syncing`. REA-verified Conductor behavior: selection stays editable while syncing; only empty categories remain disabled. Candidate patch at `evidence/dialogs/config-sync-pending-selection/candidate.patch`. The 20-case fixture `configSyncPendingSelection.test.ts` is prepared and outside automatic test discovery. **Requires ACC direct behavioral admission** (baseline RED then candidate GREEN) before PR eligibility. No runner started; no product change applied here.

### Unowned implementable dialogs gap

**None** at `327277f40`. All remaining dialogs source candidates require ACC behavioral admission before PR eligibility.

## Diff / files lane reconciliation, main `67be967f6`, 13 November 2026

Conductor Rebuild reconciled the diff/files lane (Session `de6c02f4`) against current main `67be967f6e4e3341909e1fb269eac941a0551d59`. No Mac launch, native capture, install, build, runner or dispatch. Static source-sweep and REA obligation cross-check only.

REA reference: Conductor 0.87.6 artifact SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. REA obligation ledger ID `rol_ba2a4881609d4eec7a8be78f1d5035ba6cd0f218c0073f39a66ceafade50e29c`. No new capture performed.

### #1208 source qualification at main `c5d48d0d`, 13 November 2026

Conductor Rebuild qualified `feat(files): add confined workspace text viewer` (#1208, merge commit `3babb66b`) against actual containing main `c5d48d0dbef74eeb13288770b6ad871224459a4d`. No Mac launch, native capture, install, build, runner or dispatch.

**Source check:** `git merge-base --is-ancestor 3babb66b c5d48d0d` → confirmed on main. `git diff 3babb66b c5d48d0d -- src-tauri/src/workspace_file.rs src/features/files/WorkspaceFileView.tsx src/features/files/readText.ts src/features/files/readMarkdown.ts src/features/files/WorkspaceFileView.test.ts src/features/files/readText.test.ts src/features/files/workspaceFile.css src-tauri/src/lib.rs crates/openconductor-db/src/diff_comments.rs src/features/diff/EditInViewer.ts` → **empty**. All 10 implementation paths unchanged from merge commit to current main; no subsequent commit regressed the workspace-text viewer.

**Unit tests at main `c5d48d0d`:** `node --experimental-strip-types --test --test-concurrency=1 src/features/files/readText.test.ts src/features/files/WorkspaceFileView.test.ts` → **27 passed, 0 failed, 0 skipped**.

**TypeScript:** `npx tsc --noEmit` → **exit 0** (clean).

Dependency #1222 (formatter-only) confirmed merged before `3babb66b`. Status: **SOURCE_QUALIFIED at `c5d48d0d`**. Behavioral and native remain NOT_RUN (require ACC admission and E1 respectively).

### Merged increments (source → CI green → behavioral)

All 23 merged diff/files source items carry green hosted CI at their exact heads. The two most recently merged are:

| PR | Commit | Title | Behavioral | Native |
|---|---|---|---|---|
| [#1208](https://github.com/reason-machines/openconductor/pull/1208) | `3babb66b` | feat(files): add confined workspace text viewer | SOURCE_QUALIFIED (`c5d48d0d`) | NOT_RUN |
| [#864](https://github.com/reason-machines/openconductor/pull/864) | `fa1cd4aa` | fix(diff): route the file-menu open shortcut to its selected file | NOT_RUN | NOT_RUN |

Earlier merged items cover: selected-row scroll, comment counts at handoff, duplicate pending review comments, comment save failures, binary/empty-file fallback messages, large-file placeholder policy, independent inline comment drafts, inline draft remount, IME comment shortcut protection, moved comment anchors, whitespace editing, whole-file refresh, loading/error states, file ancestor reveal, Changes tree collapse retention, single-file summary hide, rename origins, empty-diff tab close, recent file view retention, filter no-match view, filter redirect, viewed marks across scopes, comment discard confirmation, changed comment draft preservation, Changes navigation order, and viewed-files flat ordering.

### Source drift check at `c5d48d0d`

Commits between the last lane-active main (`e586c968`) and current `c5d48d0d` that touch diff/files paths: **none**. The diff/files commits in that window (`fa1cd4aa` #864, `3babb66b` #1208) are this lane's own merges. Commits `9ba7c05b` (#1244 composer), `4ab3153ac` (#1245 settings), `67be967f6` (#859 chat), `dec1c94fc` (#1241 dialogs), `75d664977` (#1243 persistence), `e586c968` (#1239 terminal), `674cc4135` (#856 composer), `9923d277a` (#1240 composer), and `c5d48d0d` (#1247 ledger) touch no diff/files paths. All earlier evidence contracts remain materially current.

### REA-proven gap: WORKSPACE-GREP (unimplementable this lane)

REA obligation `ws.file-tree-search` (ledger `rol_ba2a4881…`) identifies Conductor's `grep_workspace` Tauri command (located at `list_file_tree, fuzzy_match_files, fuzzy_filter_files, grep_workspace` in artifact `0ba55751`) as a required obligation. At current main `67be967f6`, `grep_workspace` is **absent** from both `src/backend.ts` and `src-tauri/src/`: no frontend call, no Rust command handler, no registration in `src-tauri/src/lib.rs`. `fuzzy_filter_files` and `fuzzy_match_files` are implemented; `grep_workspace` is not.

Status: **unimplementable from source alone**. The obligation explicitly requires `required_next_evidence: "Ghidra binding of the Rust #[tauri::command] handler"` before implementation can proceed. No PR opened; no product change. Assign to a lane with native REA access for Ghidra analysis.

### Native acceptance checklist (21 items unverified)

All 21 native behavioral checks remain unverified by the sole native executor (E1). The items span five categories matched against evidence in `evidence/diff/` and `evidence/files/`:

| Category | Evidence refs | Native status |
|---|---|---|
| Changes list ordering/presentation | `changesPresentation.test.ts`, `changesTree.test.ts`, `changesFilter.test.ts`, `selected-row-scroll`, `changes-panel/` | 0/6 unverified |
| Navigation | `nav.test.ts`, `viewed-navigation.md`, `viewed-flat-order.md`, `fileOpenShortcut.test.ts` | 0/4 unverified |
| Retained file views | `workspace-text/`, `visited-file-retention.md`, `presentation-retention/` | 0/3 unverified |
| Diff viewer editor/interaction | `EditInViewer.test.ts`, `hidden-whitespace-editing/`, `newInlineDraftRemount`, `commentSubmitPending/`, `commentSaveFailure/`, `fileCommentCountLifecycle.test.ts` | 0/6 unverified |
| Files panel | `AllFilesTree.tsx` collapse/search/open toolbar, `workspace-text/` preview | 0/2 unverified |

### Unowned implementable diff/files source gap

**None** at `67be967f6`. The only REA-proven missing feature (`grep_workspace`) requires native Ghidra analysis before implementation. All other diff/files behaviors are either implemented or outside source reach of this lane. The 21 native items above are the concrete handoff to the sole native executor.
