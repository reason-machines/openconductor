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

## Program reconciliation, main `cc837e7c`, 13 November 2026

Conductor Rebuild reconciled all active builder lane outcomes against current main `cc837e7cbf65f7b28cd65afc8869c0c18fda83b4`. No Mac launch, native capture, install, build or new runner. Static source-sweep and owner-report cross-check only.

### Settings lane: source-complete at `cc837e7c`

Owner: Session `49e3976d`. Three PRs merged; settings lane is now **source-complete**. Native acceptance remains NOT_RUN.

| PR | Commit | Title | CI | Native |
|---|---|---|---|---|
| [#1230](https://github.com/reason-machines/openconductor/pull/1230) | (prior head) | fix(settings): full-disk-access owner resolution | green | NOT_RUN |
| [#1233](https://github.com/reason-machines/openconductor/pull/1233) | (prior head) | fix(settings): settings-owner prior reconciliation | green | NOT_RUN |
| [#1242](https://github.com/reason-machines/openconductor/pull/1242) | `cc837e7c` | feat(settings): wire caffeinate consumer to prevent sleep while agents work | **PASS** (Frontend typecheck+build + Evidence tools compile, exact head `f6252cce6`) | NOT_RUN |

Note: `cc837e7c` is the confirmed merge commit for #1242 only. #1233's merge commit is not independently verified from owner report; treat as source-merged only.

**Native caffeinate acceptance (NOT_RUN, ACC/E1 owned):**
1. Caffeinate enabled + agent working → `caffeinate -i` process present
2. Caffeinate disabled + agent working → `caffeinate -i` absent
3. Battery ≤10% on battery → inhibitor stops regardless of setting
4. All agents idle → inhibitor cancelled / not restarted

No ACC behavioral admission has been performed. Sole native executor E1 (`e1e2b6b9`) remains PROVIDER_LIMIT_BLOCKED from last attempt; no retry authorized.

### Package #1782 dispatched at `cc837e7c`

Owner: `992a715e`. Run `43397108022` dispatched at `cc837e7c`, covering 26 fixes. Artifact verification pending with sole package owner. Do not label proven or accept as native-qualified until owner confirms artifact digest and ancestry.

Previous proven package: #1781 artifact `14022467827`, HEAD `db2216e1`, 25 fixes, digest `sha256:f951b9f3eeda884fde7649f10da45cc8c99d1cb669fb958592c34d072ffbb287`.

### Palette / menus: #1260 CI in_progress at `44c777f2`

Owner: `15faf4d8`. PR [#1260](https://github.com/reason-machines/openconductor/pull/1260) `feat(palette): add Move to section workspace action`. Earlier failure at head `7d42b0e0` is **historical**. Current head `44c777f2`:
- Evidence tools compile: **PASSED**
- Frontend typecheck + build: **in_progress** (run `43396573885`)
- Rust/Tauri checks: 5 skipped (expected)
- No conflict; no required review

Owner retains subscription and all-green merge. Package owner `992a715e` has event watch `cd11e0dc` armed for this merge. MOVE-TO-SECTION-PALETTE behavioral and native acceptance remain NOT_RUN, ACC serialized.

### Diff lane: #1259 owner confirmed and fix in progress

Owner: Session `6013adf2`. PR [#1259](https://github.com/reason-machines/openconductor/pull/1259) `fix(diff): wire editor.openSearch to pass ⌘F through`.

Root cause confirmed: original commit `15894f56` added `useKeybindings({"editor.openSearch": () => false})` to the Code inner component in `FileDiffView.tsx`. This was unnecessary — the dispatcher passes ⌘F through naturally with no live handler needed — and broke 10 tests: 9× `pointerCancel.test.ts` (mock missing `useKeybindings`) and 1× `viewed.test.ts` (listener count 3≠1).

Fix commit `25358baa`: removes the `useKeybindings` call and import alias; adds inline comment documenting pass-through behavior.
- Local: `pointerCancel` 74/74 PASS, `viewed` 0 failures
- CI running on head `25358baa`; merge queued once green

No duplicate builder active. Package owner notified by owner `6013adf2`.

### Composer lane: source-parity complete at `8e847380`

Owner: Session `13576d11`. Source-parity verdict confirmed at checked main `8e847380955088974ea268690a94581c45791264`: **all 18 REA-proven composer/agent-controls gaps are merged** through #1253. No unmerged source-qualified gap remains.

**Post-file-picker editor focus (observation prerequisite only):** Conductor's ITO calls `de()` after `W9` (focus request post-chooser close); OpenConductor lacks an explicit focus request after the file picker closes. Default chooser behavior on this path is unobserved. This is recorded as an **observation prerequisite**, not a confirmed bug or implementation assignment. No PR opened; no runner dispatched.

Native/browser acceptance for all composer items: NOT_RUN, ACC/E1 owned (queue: #1240, #1244, #1251, #1253). E1 PROVIDER_LIMIT_BLOCKED from last attempt; no retry authorized.

### Serialized ACC/E1 native queue (all NOT_RUN)

| Feature | Cases | Source |
|---|---|---|
| Composer queue-nav (#1240) | unverified | `9923d277` |
| Composer pointer-hover (#1244) | unverified | `9ba7c05b` |
| Composer caret-end (#1251) | unverified | `04720aed` |
| Composer hover-popup (#1253) | unverified | `db2216e1` |
| Section primary-action (#1246) | 20 cases | `7ef6cef0` |
| Queue edit caret (#1251) | 3 cases | `04720aed` |
| Settings caffeinate (#1242) | 4 cases | `cc837e7c` |
| Diff/files (all items) | 21 items | various |
| Interrupted-badge (#859) | 3 cases | `67be967f` |
| Palette MOVE-TO-SECTION | M01–M09 | awaiting #1260 merge |
| OPEN-IN-SWITCHER-ENTER-POINTER | 12 cases (frozen) | `a5387885` |

E1 (`e1e2b6b9`) PROVIDER_LIMIT_BLOCKED — last attempt `b372fe10` returned no_output. Sign-in `64baa6b6` likewise PROVIDER_LIMIT_BLOCKED — last attempt `c088e4f6` returned no_output. Neither retried.

## Program reconciliation delta r1093, 13 November 2026

Corrections to r1092 from package owner GitHub report and coordinator instruction.

### #1259 head advanced to `d5006a2c`

Owner: Session `6013adf2`. Head is now `d5006a2c` (not `25358baa` as recorded in r1092).
- Evidence tools compile: **PASSED**
- Frontend typecheck + build: **in_progress**

Owner retains subscription and merge-on-green. No duplicate builder.

### #1260 Frontend CI FAILED at `44c777f2`

Owner: `15faf4d8`. The in_progress CI result recorded in r1092 resolved: **Frontend typecheck + build FAILED with 12 test failures** at head `44c777f2`. Coordinator has sent palette owner explicit correction/fix instruction. Owner retains sole ownership; no duplicate builder.

MOVE-TO-SECTION-PALETTE behavioral and native acceptance remain NOT_RUN, ACC serialized. Package event watch `cd11e0dc` (owner `992a715e`) remains armed for the eventual all-green merge.

## Program reconciliation r1131, main `a36188938d`, 13 November 2026

### #1276 merged — scripts lane SOURCE_EXHAUSTED

Owner: Session `6013adf2`. PR [#1276](https://github.com/reason-machines/openconductor/pull/1276) `feat(scripts): persist and restore setup transcript across app restarts` merged at `050c55676`. Lane: **SOURCE_EXHAUSTED**. Browser/native NOT_RUN. Note: exact Conductor persistence mechanism (DB vs filesystem vs key path) REA UNPROVEN — merged on best-effort source match; not confirmed as native behavioral parity.

### #1268 merged — settings lane closed

Owner: Session `49e3976d`. PR [#1268](https://github.com/reason-machines/openconductor/pull/1268) `feat(settings): custom SoundSelect with group-logo rendering (iga/sga/rga)` merged squash `a36188938d`. 2 CI checks passed (Frontend typecheck+build, Evidence tools compile), 5 skipped (platform gates). Settings lane: **SOURCE_COMPLETE**, closed. Native logo rendering: NOT_RUN — requires macOS Tauri app; E1 PROVIDER_LIMIT_BLOCKED.

### Package run #1787 dispatched

Owner: `992a715e`. Run id `43412568764` dispatched at `a36188938d` (33 fixes). Artifact follow-up armed at owner. Do not duplicate dispatch.

### All source lanes exhausted

| Session | Surface | Status | Note |
|---|---|---|---|
| `6013adf2` | scripts/dialogs | SOURCE_EXHAUSTED | Idle |
| `49e3976d` | settings | SOURCE_COMPLETE | Closed |
| `27102e36` | Home/sidebar | SOURCE_EXHAUSTED | 5-item native packet queued E1 |
| `be7a40e4` | chat | SOURCE_EXHAUSTED | at `86748725` |
| `13576d11` | composer | SOURCE_EXHAUSTED | at `8e847380` |
| `de6c02f4` | diff/files | SOURCE_EXHAUSTED | #1275 merged; Q-01–Q-32 E1-owned |
| `1f14fa82` | terminal/scripts | SOURCE_EXHAUSTED | local 2.3% historical; cloud-org excluded |

**Unowned ready REA-proven source gaps: NONE.** Program is at the acceptance bottleneck. No work invented to fill idle lanes.

Active builders: `15faf4d8` (#1271 open + PICK-ISSUES-DIALOG), `992a715e` (package #1787).

E1 (`e1e2b6b9`) PROVIDER_LIMIT_BLOCKED — no retry authorized absent confirmed reset.

## Diff/files lane gap audit + Q-01–Q-31 recovery, main `0e91f39d5`, 13 November 2026

Owner: Conductor Rebuild (Session `de6c02f4`). No Mac launch, native capture, install, build or runner. Static source-sweep and retained-evidence cross-check only. REA artifact SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` (Conductor 0.87.6 `index-BGEQ8YjU.js`), renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (`renderApp-D_fmY7hW.js`).

### Fresh gap audit at `0e91f39d5`

Commits touching `src/features/diff/`, `src/features/files/`, `evidence/diff/`, `evidence/files/` since last lane reconciliation (`67be967f`):

| Commit | PR | Title | Lane owner |
|---|---|---|---|
| `25bfd448` | [#1257](https://github.com/reason-machines/openconductor/pull/1257) | feat(files): add grep_workspace Tauri command and frontend binding | DE6 `de6c02f4` |
| `ed5fb635` | [#1259](https://github.com/reason-machines/openconductor/pull/1259) | fix(diff): wire editor.openSearch to pass ⌘F through to Pierre's native search panel | `6013adf2` |

`#1257` is this lane's own delivery. `#1259` was owned by `6013adf2`; it adds one new diff-surface native acceptance item (Q-32, below) now on main.

**Unowned implementable source gap: None.** All REA-proven diff/files behaviors are implemented at `0e91f39d5`. The only remaining work is native behavioral verification (31 prior items + 1 new item from #1259).

### Q-01–Q-31 per-assertion recovery

**Provenance note.** Q-01–Q-21 were previously transmitted to coordinator `dcaa6e78` only as category groups (5 categories, 21 total) with evidence-file refs, not as individually numbered assertions. The per-assertion descriptions below are **evidence-derived** (each cited to the evidence file or test name that establishes the behavior) and were not previously transmitted as individually numbered text. Q-22–Q-31 are **verbatim retained** from the codemode message sent to ledger owner `ddfc6518` at 2026-11-13T08:17Z (source `a67f6977-f33e-4d1f-a146-cad39103eade`, revision 27672196). Native status: all 31 items are NOT_RUN, ACC/E1 owned.

#### Category 1 — Changes list ordering/presentation (Q-01–Q-06)

Evidence refs: `evidence/diff/selected-row-scroll/`, `src/features/diff/changesPresentation.test.ts`, `src/features/diff/changesTree.test.ts`, `src/features/diff/changesFilter.test.ts`, `evidence/diff/changes-panel/`, `evidence/diff/filter-no-match-view.md`, `evidence/diff/filter-selection-redirect.md`

| ID | Assertion text | Provenance |
|---|---|---|
| Q-01 | Active Changes file row scrolls into view after navigation/selection with `scrollIntoView({block:"nearest"})`; request deferred until presentation has hydrated | evidence-derived: `evidence/diff/selected-row-scroll/README.md`, unit `DIFF-SELECTED-ROW-SCROLL-01` |
| Q-02 | In flat Changes view, unviewed files appear above viewed files; paths within each group are sorted alphabetically; viewed grouping uses the production `viewed ≥ modification_time` predicate | evidence-derived: `changesTree.test.ts` tests "flat changes put unviewed files first…" and "flat ordering uses the production viewed timestamp predicate…" |
| Q-03 | Changes presentation state (collapsed directory paths, filter query, list mode) is retained across panel-tab switches and workspace reselections; a failed storage read does not erase unseen sibling routes | evidence-derived: `changesPresentation.test.ts`, `evidence/diff/presentation-retention/README.md` |
| Q-04 | Filter text matches file paths fuzzy and case-insensitively; a rename matches on its old path too; no match produces an empty list | evidence-derived: `changesFilter.test.ts` tests "matching is fuzzy…" and "a rename matches on its old path too" |
| Q-05 | When the Changes filter matches no files, the diff panel hides; the no-match state is shown instead of an empty Changes list alongside a file diff | evidence-derived: `evidence/diff/filter-no-match-view.md` |
| Q-06 | Selecting a file from outside the Changes filter routes it into the filter (adds its path as the filter query and opens the diff) | evidence-derived: `evidence/diff/filter-selection-redirect.md` |

#### Category 2 — Navigation (Q-07–Q-10)

Evidence refs: `src/features/diff/nav.test.ts`, `evidence/diff/viewed-navigation.md`, `evidence/diff/navigation-order.md`, `src/features/diff/fileOpenShortcut.test.ts`, `evidence/diff/file-open-shortcut/`

| ID | Assertion text | Provenance |
|---|---|---|
| Q-07 | Prev/next-comment navigation uses the viewport reading line; comments fully on-screen count in neither direction; a comment partly above the reading line counts as previous | evidence-derived: `nav.test.ts` tests "a comment above the reading line is previous even while still partly on screen" and "comments on screen count in neither direction" |
| Q-08 | After marking a file viewed (Ctrl+V / `diff.toggleViewed`), navigation moves to the next unviewed file in presentation order; already-viewed files are unmarked without navigation | evidence-derived: `evidence/diff/viewed-navigation.md` |
| Q-09 | Changes navigation (ArrowUp/Down) follows the current presentation order (filtered, sorted, tree/flat) rather than a fixed file-index order | evidence-derived: `evidence/diff/navigation-order.md` |
| Q-10 | The file-open shortcut (⌘D or configured binding) opens the selected Changes file immediately in the first file-capable app without showing the workspace chooser | evidence-derived: `fileOpenShortcut.test.ts` test "open file immediately rather than the workspace chooser", `evidence/diff/file-open-shortcut/` |

#### Category 3 — Retained file views (Q-11–Q-13)

Evidence refs: `evidence/files/workspace-text/`, `evidence/diff/visited-file-retention.md`, `evidence/diff/presentation-retention/`

| ID | Assertion text | Provenance |
|---|---|---|
| Q-11 | The Files panel opens UTF-8 workspace text files (and Markdown) in a confined `WorkspaceFileView` without leaving the app or requiring a git change | evidence-derived: `evidence/files/workspace-text/core33-20261113/README.md`, PR #1208, 94 Node tests passed |
| Q-12 | The five most recently visited diff file views (path + scope) are retained and restored when navigating back to a previously visited file | evidence-derived: `evidence/diff/visited-file-retention.md` |
| Q-13 | Collapsed-folder and filter-query presentation state survives switching away from the Changes panel and returning; collapse of a single directory persists without resetting other saved paths | evidence-derived: `evidence/diff/presentation-retention/README.md`, browser capture in `evidence/diff/presentation-retention/collapse-comparison.png` |

#### Category 4 — Diff viewer editor/interaction (Q-14–Q-19)

Evidence refs: `src/features/diff/EditInViewer.test.ts`, `evidence/diff/hidden-whitespace-editing/`, `evidence/diff/new-inline-draft-remount/`, `evidence/diff/comment-submit-pending/`, `evidence/diff/comment-save-failure/`, `src/features/diff/fileCommentCountLifecycle.test.ts`

| ID | Assertion text | Provenance |
|---|---|---|
| Q-14 | Entire-file edit mode presents and saves the complete new-file text, not only the visible patch hunks; a missing final newline is preserved | evidence-derived: `EditInViewer.test.ts` test "the entire-file view edits the new file's full text, keeping a missing final newline" |
| Q-15 | In hidden-whitespace view, the editor buffer receives the full unfiltered text (whitespace filtering applies only to Pierre's presentation); editing and saving produce the full file, not a whitespace-stripped version | evidence-derived: `evidence/diff/hidden-whitespace-editing/README.md`, unit `hidden-whitespace-editing` |
| Q-16 | A new inline comment draft body is retained after the diff remounts (file-switch and return to same file); the textarea reopens with the original text | evidence-derived: `evidence/diff/new-inline-draft-remount/README.md`, unit `DIFF-NEW-INLINE-DRAFT-REMOUNT-SOURCE-DE6` |
| Q-17 | While a pending comment submit is in flight, repeated clicks and accepted keyboard shortcuts cannot create a duplicate comment from the same draft; the submit button is effectively gated until settlement | evidence-derived: `evidence/diff/comment-submit-pending/README.md`, unit `SUBMIT-PENDING-IDENTITY-DE6-01` |
| Q-18 | A comment save failure (rejected existing-comment edit) emits exactly one error notification with the rejection reason; the draft and retry controls remain available | evidence-derived: `evidence/diff/comment-save-failure/README.md`, unit `EDIT-SAVE-FAILURE-FEEDBACK-DE6-01` |
| Q-19 | Each Changes-list file row shows its active comment count badge (local + remote, not sent/resolved/outdated/PR-level); the count updates immediately when a draft is added, removed, or its submit completes | evidence-derived: `fileCommentCountLifecycle.test.ts` tests `${mode} rows count active local and remote comments…` and "saving through the actual new-draft composer updates the row count…" |

#### Category 5 — Files panel (Q-20–Q-21)

Evidence refs: `src/features/files/AllFilesTree.tsx` (collapse/filter/open toolbar), `evidence/files/workspace-text/` (Markdown preview)

| ID | Assertion text | Provenance |
|---|---|---|
| Q-20 | The "Collapse folders" toolbar button in the Files panel collapses all expanded folder rows in `AllFilesTree` immediately | evidence-derived: `src/features/files/AllFilesTree.tsx` lines 41–53, 62, 130–135 (`collapseSeq` increment → `scrollTo(0)` reset) |
| Q-21 | Markdown and plain text workspace files open in a preview panel in the Files tab without navigating away; the preview shows rendered content (Markdown) or plain UTF-8 text | evidence-derived: `evidence/files/workspace-text/core33-20261113/README.md`, `evidence/files/markdown-preview.md` |

#### grep_workspace (Q-22–Q-31) — verbatim retained

Source: codemode `a67f6977-f33e-4d1f-a146-cad39103eade` rev 27672196 (message to ddfc6518, 2026-11-13T08:17Z). These are the exact strings as sent.

| ID | Assertion text |
|---|---|
| Q-22 | Basic literal search: query "fn main" in a Rust workspace → matches returned with file paths + line ranges |
| Q-23 | Regex search: query "fn .+_handler" with isRegex:true → regex matches returned |
| Q-24 | Case-sensitive: query "Main" caseSensitive:true → no match for "main" lowercase |
| Q-25 | Case-insensitive (default): query "MAIN" caseSensitive:false → matches "main" |
| Q-26 | Whole-word: query "fn" wholeWord:true → matches "fn" token, not "fn_helper" substring |
| Q-27 | Binary skip: binary files in workspace → absent from results |
| Q-28 | Gitignore: files in .gitignore → absent from results |
| Q-29 | Multi-submatch: query "use" in file with multiple occurrences → all match ranges returned per line |
| Q-30 | Truncation: workspace with >1000 matches → truncated:true in response |
| Q-31 | Error path: unreadable workspace path → structured error, no crash |

### Q-32 — new item from #1259 (owner `6013adf2`)

Merged 2026-11-13T09:04Z at `ed5fb635`. Native acceptance: **NOT_RUN** (ACC/E1 serialized).

**Q-32** (evidence-derived): `editor.openSearch` (⌘F in diff viewer) passes through the dispatcher without prevention, reaching Pierre's own `"cmdOrCtrl+f": "openSearchPanel"` keymap entry, which opens Pierre's native search panel. No `useKeybindings` handler is registered for this command in `FileDiffView.tsx`; the pass-through is documented inline at line 159. Source: `evidence/diff/file-open-shortcut/` REA string `kqo.literal.txt`; `src/features/diff/FileDiffView.tsx` lines 159–162.

### Discrepancy note

Coordinator message references "28 unavailable" of Q-01–Q-31. This lane's retained evidence gives: 10 verbatim (Q-22–Q-31) and 21 evidence-derived (Q-01–Q-21) = 31 total. If the coordinator counted only the verbatim-retained items as "available" and the evidence-derived ones as requiring further text delivery, that is 21 unavailable — not 28. The 7-item discrepancy is unresolved from source alone; coordinator `dcaa6e78` holds the authoritative count.

## Diff/files evidence sweep + stale artifact cleanup, main `8416fc30d`, 13 November 2026

Owner: Conductor Rebuild (Session `de6c02f4`). No Mac launch, native capture, install, build, dispatch or runner. Static source-sweep and working-tree check only. REA artifacts SHA-256 unchanged from prior entries.

### Evidence directory sweep (all 20 directories)

All evidence directories in `evidence/diff/` and `evidence/files/` cross-checked against current main `8416fc30d`. Every directory maps to an already-merged or already-implemented feature:

| Evidence dir | Merged/implemented via |
|---|---|
| `comment-cancel-dirty` | #926 — 28/28 node tests pass |
| `comment-delete-confirmation` | `window.confirm` absent in current `ReviewComments.tsx`; 6/6 tests pass |
| `comment-discard-dialog` | `DialogFrame` alert present lines 125–138 of `ReviewComments.tsx`; 28/28 lifecycle tests pass |
| `pointer-cancel-selection` | #881 — `onPointerCancelCapture` at `FileDiffView.tsx:234` |
| `selection-end-clear` | #887 — `else setSelection(null)` at `FileDiffView.tsx:197` |
| `multi-anchor-drafts` | #1088 — `useState<Composing[]>([])` retains N drafts; 13/13 hosted green |
| `file-copy-paths` | #858 — `fileCopyPaths.ts`, 5/5 after.tap pass |
| `historical-chip` | chip colours via `renderApp` CSS tokens; hosted green |
| `historical-large-file` | #1121 — 8/8 behavioral tests pass |
| `turn-large-file` | #1143 — `fix(diff): apply the large-file policy to finished turns` |
| `commit-history` | historical scope merged; 48 Rust + 113 Node tests pass |
| `discard-alert` | #738 — `fix(diff): match the reference confirmation alert` |
| `selected-reveal` | #1022 — `fix(diff): reveal active file ancestors in Changes tree` |
| `empty-consumer` | #1013 — `fix(diff): distinguish initial loading and error states` |
| `changes-menu-boundary` | `PopoverMenu.tsx:53` uses `el.offsetWidth/offsetHeight`; E2E asserts `< 1px delta` |
| `wrap-lines-and-range-comments` | `wrapLines` localStorage vs Conductor settings DB — acknowledged gap, settings lane |
| `grep-workspace` | #1257 — Rust command + frontend binding; 10 native cases with E1 |
| `workspace-text` | #1208 — confined `WorkspaceFileView`; 94/94 node tests |
| `markdown-preview` | Markdown rendered inline in `WorkspaceFileView` |

### Stale artifact cleaned

`src/features/diff/fileCommentCounts.test.ts` was an **untracked** working-tree file (never committed). It contained 11 duplicated lifecycle-test cases plus 1 stale assertion (`state === "sent"` after `addAll`) from the pre-#1181 design. The authoritative contract from #1181 is that adding to the composer does **not** mark state `"sent"` until actual prompt handoff. The stale file was deleted from the working tree; hosted CI was never affected.

### Verification

- `node --experimental-strip-types --test src/features/diff/*.test.ts`: **517/517 pass** (after stale file removed)
- `npm run typecheck`: **pass**
- `git status`: clean (only `.oc-tmp/` ephemeral dir)

### Remaining wrap_lines gap

`wrapLines` persists in `localStorage` (`OPTIONS_KEY`) in OpenConductor; Conductor uses `updateSetting("wrap_lines", value)` to its native settings table. All other diff view options also use localStorage. This is a known, documented gap in `evidence/diff/wrap-lines-and-range-comments.md`. It belongs to the settings lane; source-only resolution is not possible without the native settings schema.

### Unowned implementable diff/files source gap

**None** at `8416fc30d`. The 32 native behavioral items (Q-01–Q-32) remain with the sole native executor (E1). The `wrap_lines` settings-DB gap is settings-lane owned.

## Diff/files fresh audit at main `8f62e6e3d`, 13 November 2026

Owner: Conductor Rebuild (Session `de6c02f4`). No Mac launch, native capture, install, build or runner. Static source-sweep against 17 new commits since r1131 (`a36188938d` → `8f62e6e3d`). REA artifact SHA-256 unchanged from prior entries.

### New commits since r1131 touching diff/files scope

| Commit | PR | Title | Diff/files impact |
|---|---|---|---|
| `8f44c4f1f` | [#1271](https://github.com/reason-machines/openconductor/pull/1271) | feat(palette): add REA-proven missing workspace actions | `src/state/rowStatus.ts` exports `readyToMerge` (no diff-viewer impact); palette adds `search-in-files` with `searchInFiles: undefined` gate |

All other 16 commits touch chat, scripts, settings, palette CSS, or docs — zero diff/files source files changed.

### Evidence directory sweep (all evidence/diff/ and evidence/files/ dirs)

All 20+ evidence directories cross-checked against main `8f62e6e3d`. Previously unreviewed items confirmed implemented:

| Evidence dir | Confirmed via |
|---|---|
| `rename-origin.md` | `src/features/diff/renameDisplayPath.ts` (#969) |
| `viewed-scope-retention.md` | `src/features/diff/viewed.ts` (#936) |
| `refresh-status/` | `src/features/diff/refreshStatus.test.ts` (#1001) |
| `whole-file-refresh/` | `src/features/diff/wholeFileRefresh.test.ts` (#995) |
| `comment-ime-submit/` | `ReviewComments.tsx:80–105` IME guard |
| `comments-github.md` | `ReviewComments.tsx:71` GITHUB_SYNC_MS, `src/features/diff/githubComments.test.ts` |
| `comments-to-chat.md` | `src/features/diff/commentMarkdown.ts`, `commentAttachment`, `chatAttachment.ts` |
| `moved-comment-anchors/` | `src/features/diff/movedCommentAnchors.test.ts`, `commentsApi.ts:27` |
| `workspace-comment-read-isolation/` | `src/features/diff/workspaceCommentReadIsolation.test.ts` (#1198) |
| `large-file-placeholder/` | `FileDiffView.tsx:262` `hide_reason === "file_too_large"` |
| `literal-selected-path/` | `src-tauri/src/diff/literal_path_tests.rs` |
| `empty-diff-close.md` | `emptyLoadStates.test.ts:190–199`, `viewed.test.ts:1214,1226` |
| `comment-navigation.md` | `src/features/diff/CommentNav.tsx` |
| `copy-whitespace.md` | `src/features/diff/copyFile.ts:34` additions/deletions eligibility |
| `turn-changes.md` | `src/features/diff/turnChangesCache.ts`, `useTurnChanges.ts` |

### New REA evidence gap — search-in-files dialog

**Gap identifier:** `ws.search-in-files-dialog` (new, not previously recorded).

**What is known from retained source:**

- Conductor's `renderApp-D_fmY7hW.js` palette handler (complete source in `evidence/settings/theme-default/reachability/renderApp-3.txt`) contains: `else if(Gn==="search-in-files"){if(!Tr)return;nr.openDialog(_Se)}`
- `_Se` is a dialog constant. `nr.openDialog(bSe)` is used for quick-open; `nr.openDialog(_Se)` is for search-in-files. They are distinct dialogs.
- The keybinding is `meta+shift+f` → `nav.searchInFiles` (from `evidence/keybindings/keybindings.json`).
- The Tauri IPC contract (`grep_workspace`) is fully documented in `evidence/files/grep-workspace/REA.md` and implemented in #1257.

**What is NOT known:**

- The layout and UI of `_Se`: number of fields, field types (query input, regex toggle, case-sensitive toggle, whole-word toggle), result display format (file tree vs flat list, line previews, match count), scroll/pagination, empty/error states.
- The byte range of `_Se` and its component definition in the retained `renderApp-D_fmY7hW.js`.

**REA extraction needed:**

Target: retained `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, 11,600,457 bytes. The `_Se` constant appears in the palette handler source above; its definition is in the same bundle at an unknown offset. A bounded Python read near `bSe` (the quick-open dialog constant, whose offset is similarly unknown from the available evidence) would likely locate `_Se`. REA `trace-javascript-semantics` on the retained `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` has incomplete renderer coverage (heap exhaustion) so cannot be used directly.

**OpenConductor current state:**

`App.tsx:468` has `searchInFiles: undefined`. `PaletteHost.tsx:127` filters out `search-in-files` when `commands.searchInFiles` is absent (same gate pattern as `create-section`). The palette entry is visible in the action list but suppressed from selection until a dialog implementation lands. This is the intentional design from #1271.

### Conclusion

**SOURCE_EXHAUSTED at `8f62e6e3d`.** No unowned implementable diff/files source gap exists beyond the search-in-files dialog, which is blocked by REA evidence gap `ws.search-in-files-dialog`. The 32 native behavioral items (Q-01–Q-32) remain with sole native executor E1. Priority acceptance cases for E1: Q-17 (submit-pending gate), Q-16 (inline draft remount), Q-19 (comment count badge), Q-01 (selected-row scroll), Q-02 (flat list viewed ordering).

---

## Program reconciliation r1137 at main `c189ea62`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1278 merged** — squash `c189ea62` (docs(ledger): program reconciliation r1131). Merge-conflict event was stale; PR had already landed.

**Package run #1788 (`e963fb31`) artifact confirmed** — `OpenConductor-debug-macos`, sha256 `908387b4668e2a92ae295b4e548efab1a571962beed788eee54786c552c35563`, 109 051 934 bytes, completed 11:13:48Z. Forwarding to E1 blocked (PROVIDER_LIMIT_BLOCKED).

**Settings full browser acceptance — PASS** (Session `49e3976d`, main `a36188938d`, Vite dev + cloud Chrome):

| Tab | Items | Result |
|---|---|---|
| General / SoundSelect | 7 DOM groups (1 unnamed → "No sound", 6 labeled), 6 visible group-label headers, 14 items, 4 transit logos (muni/mta/metro-de-paris/sncf), Classic/Novelty plain, onChange fires | PASS (browser) |
| Appearance | 12 rows: Theme, Low-contrast, App zoom, Colored sidebar diffs, Accessible colors, Code theme, Mono Font, Code ligatures, Markdown Style, Terminal font, Color palette + preview blocks | PASS (browser) |
| Keyboard shortcuts | 5 groups, full row list | PASS (browser) |
| Environment | Table CRUD via localStorage: add `MY_API_KEY`, 18 documented vars toggle, remove all; Add env file button present | PASS (browser) |
| Advanced | 9 rows: root dir, Claude path, Codex exec path, SSH key, Remote MCP, Always allow, File sync, Set upstream, Scrollback | PASS (browser) |

Recording: https://api.reasonmachines.com/media/pr-screenshots/746fef00-042c-424c-99a4-35c5e3982e29/a4f7aaacd3f8287e39857df2a854f6bd/6956955b-aa40-4b64-a13d-1a1f1969de19.webm

**NOT_RUN (requires macOS Tauri native):** settings.toml save/reload, native file pickers, full disk access check, env-file variable counts, RootPathRow native display.

### Group count reconciliation (SOUNDSELECT-BROWSER-ACCEPTANCE-49-01)

Reconciled from source (`sound.ts` + `SoundSelect.tsx`, main `a36188938d`) and two browser runs:
- **7 DOM `Select.Group` nodes**: 1 unnamed (`group: ""` → "No sound"), 6 named
- **6 visible `Select.GroupLabel` headers**: Classic, Novelty, SF Muni, NYC MTA, Paris Métro, SNCF (unnamed group suppressed by `group.label && …` guard in `SoundSelect.tsx:92`)
- **14 total items**: No sound (1) + Classic (2) + Novelty (3) + SF Muni (2) + NYC MTA (3) + Paris Métro (2) + SNCF (1)
- **4 transit logos** (`GROUP_LOGOS` entries): SF Muni, NYC MTA, Paris Métro, SNCF; Classic and Novelty are text-only (correct)

Both prior run counts were correct and measured different things. No source defect. SOUNDSELECT-BROWSER-ACCEPTANCE-49-01 reconciled; native logo rendering NOT_RUN.

### Packaging consolidation (from `992a715e`)

- **#1787 failed** — E0599 compile error (missing `Manager` import).
- **#1277 merged** — squash `e963fb31`; fixes `tauri::Manager` import for `AppHandle::state()`.
- **#1788 succeeded** — artifact `14031068467` (`OpenConductor-debug-macos`), sha256 `908387b4668e2a92ae295b4e548efab1a571962beed788eee54786c552c35563`, 109 MB, expires 2026-11-20. E1 handoff blocked (PROVIDER_LIMIT_BLOCKED).

Packaging lane closed by `992a715e`. Artifact preserved; native acceptance remains NOT_RUN.

### Menus/palette lane

**#1271 merged** — squash `8f44c4f1`; feat(palette): REA-proven missing workspace actions (search-in-files, link-issue, PR actions). Lane closed by `15faf4d8`. (CI ref `1335a0b5` confirmed passing.)

PICK-ISSUES-DIALOG work by `15faf4d8`: status per last report — ongoing. No duplication from this entry.

**#1279 merged** — squash `33ae5f4f`; repair work by `7e1889e6` complete.
**Package run #1789** (`43418374262`) dispatched by `992a715e` at `33ae5f4f` (35 fixes, in_progress). Artifact follow-up owned by `992a715e` — do not duplicate dispatch or polling.

### Active owners

| Session | Work | Status |
|---|---|---|
| `15faf4d8` | PICK-ISSUES-DIALOG | Ongoing |
| `992a715e` | Package run #1789 artifact follow-through | In progress — pending artifact proof |

### State

- **Source gaps: NONE claimed in r1137/r1138 — CORRECTED in r1139 below.**
- **ACC E2E:** PASS at `2c7563a7` (stand-ins/fixtures). Native 39 NOT_RUN.
- **Native acceptance:** E1 PROVIDER_LIMIT_BLOCKED at 11:21Z Nov 13 (coordinator direct observation; supersedes 07:00Z Nov 11 standing guidance). Native Settings reassignment to `49e3976d` REVERTED — was not an executed authorization. Sole native executor remains E1. All native items frozen.
- **Program bottleneck:** E1 quota reset required. No retry authorized until confirmed.

---

## Program reconciliation r1138 at main `33ae5f4f5`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1278 merged** — `c189ea62` (docs ledger r1131). Subscription closed.

**#1279 merged** — `33ae5f4f` (35 packaging/repair fixes, `7e1889e6`). Package run #1789 (`43418374262`) dispatched by `992a715e`; artifact pending, owned by `992a715e` — no duplicate dispatch.

**Native Settings acceptance reassignment** — `dcaa6e78` authorized reassignment from E1 (`e1e2b6b9`) to `49e3976d`. E1 retains all non-Settings native items (Q-01–Q-32). Native Settings (settings.toml persistence, file pickers, Tauri IPC × 5 tabs, macOS rendering) remains NOT_RUN pending `49e3976d` evidence. **No parallel native activity created by prior coordination prose; sole native executor E1 preserved for non-Settings scope.**

**#1280 in-progress** — head `c57788d`; 5 skipped, 2 in-progress (`Frontend typecheck + build`, `Evidence tools compile`). Will merge on green.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG ongoing |
| Packaging artifact | `992a715e` | Run #1789 pending artifact proof |
| Native Settings acceptance | `49e3976d` | Assigned; NOT_RUN |
| Native behavioral Q-01–Q-32 | E1 `e1e2b6b9` | Quota reset confirmed; available on request |
| All other lanes | — | SOURCE_EXHAUSTED |

---

## Program reconciliation r1139 at main `33ae5f4f5`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`). Substantive correction to r1137/r1138.

### Corrections

**E1 PROVIDER_LIMIT_BLOCKED** — coordinator (`dcaa6e78`) reports latest E1 attempt failed provider usage at 11:21Z Nov 13. This is more recent than the 07:00Z Nov 11 quota-reset standing guidance. E1 is BLOCKED. No retry authorized.

**Native Settings reassignment REVERTED** — `dcaa6e78` confirms the prior prose claiming reassignment to `49e3976d` was not an executed authorization. Sole native executor remains E1 (`e1e2b6b9`). `49e3976d` is browser-only. All native acceptance (Settings IPC + Q-01–Q-32 diff/files/composer/palette items) frozen until E1 quota resets.

**#1280 merged** — squash `541c9e4c`, docs(ledger) r1138. All 7 checks passed (2 green, 5 skipped).

### Substantive unowned REA-proven gaps

**1. CONFIG-SYNC-PENDING-SELECTION** (dialogs lane)
- **REA basis:** `ConfigSyncDialog.tsx` lines 90/107 disable category/item checkboxes when `state.kind !== "ready"`. REA-verified Conductor behavior: selection remains editable during `syncing`; only empty categories stay disabled.
- **Status:** Unowned. Candidate patch at `evidence/dialogs/config-sync-pending-selection/candidate.patch` exists (confirmed readable). 20-case fixture `configSyncPendingSelection.test.ts` prepared and outside automatic test discovery.
- **Gate:** Requires ACC behavioral admission (baseline RED → fix GREEN) before PR eligibility.
- **Assignment:** `6013adf2` (dialogs/scripts, idle, SOURCE_EXHAUSTED on prior scope) is the natural assignee. Work: apply patch → run baseline RED → run fix GREEN locally → submit for ACC queue admission.

**2. WORKSPACE-GREP** (diff/files lane)
- **REA basis:** `grep_workspace` Tauri command present in Conductor 0.87.6 artifact (`0ba55751`). Absent from both `src/backend.ts` and `src-tauri/src/` on current main.
- **Status:** Unimplementable from source alone. Requires Ghidra binding of the Rust `#[tauri::command]` handler (native REA access). NOT assignable to a cloud-only builder.

### Lane / owner table (corrected)

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG ongoing |
| Packaging artifact | `992a715e` | Run #1789 pending artifact proof |
| Dialogs (CONFIG-SYNC) | `6013adf2` | IDLE — assignable to CONFIG-SYNC-PENDING-SELECTION |
| Native (all items) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED (11:21Z). No retry. |
| 49e3976d | Settings browser | BROWSER_PASS; native assignment REVERTED |

### Serialized cloud runtime queue

- **Active:** PICK-ISSUES-DIALOG (`15faf4d8`), Package #1789 artifact (`992a715e`)
- **Ready for assignment:** CONFIG-SYNC-PENDING-SELECTION → `6013adf2` (apply patch, ACC queue)
- **Blocked native:** All ACC/E1 queue items frozen (E1 PROVIDER_LIMIT_BLOCKED)

### State

- **Substantive unowned source gap: 1** — CONFIG-SYNC-PENDING-SELECTION, assignable to `6013adf2`.
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (requires Ghidra native REA).
- **ACC E2E:** PASS at `2c7563a7` (stand-ins/fixtures). Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen. E1 BLOCKED (11:21Z). No retry authorized until confirmed reset.
- **Program bottleneck:** E1 quota reset required for native acceptance. One cloud source gap (CONFIG-SYNC) refillable now.

---

## Program reconciliation r1140 at main `33ae5f4f5`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**Package run #1789 SUCCESS** — `992a715e` confirms artifact `14032753489` (`OpenConductor-debug-macos`), sha256 `bc4ac5b254cb39f347a93c5443c3f00c28b13222a37b8001ce8d1751fcab90eb`, 109 MB, expires 2026-11-20. At `33ae5f4f5ce6919d82a87c57ed947959fefd0780`. Packaging lane closed. **Native acceptance remains NOT_RUN.**

**Native executor state (corrected from r1138):** Sole native executor is E1 (`e1e2b6b9`). PROVIDER_LIMIT_BLOCKED as of 11:21Z 13 Nov. Prior prose in r1138 claiming reassignment to `49e3976d` was not an executed authorization; that entry is superseded. `49e3976d` scope: browser-only. All native acceptance (Settings IPC + Q-01–Q-32) frozen until E1 quota resets.

**#1280 in-progress** — head `19293e52`; `Frontend typecheck + build` running; all other checks skipped or green. Will merge on green.

### Unowned cloud-assignable source gap

| Gap | Evidence | Assignable to |
|---|---|---|
| CONFIG-SYNC-PENDING-SELECTION | `ConfigSyncDialog.tsx` L90/107 disables selection during `syncing`; Conductor keeps it editable | `6013adf2` |

WORKSPACE-GREP: cloud-unassignable (requires native REA Ghidra binding).

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG ongoing |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — no retry |
| CONFIG-SYNC gap | `6013adf2` | IDLE — ready to assign |
| All other lanes | — | SOURCE_EXHAUSTED |

### State

- **Unowned cloud gap: 1** — CONFIG-SYNC-PENDING-SELECTION (`6013adf2`)
- **Cloud-unassignable: 1** — WORKSPACE-GREP
- **Native acceptance:** ALL frozen (E1 BLOCKED)
- **ACC E2E:** PASS at `2c7563a7` (stand-ins/fixtures). Native 39 NOT_RUN.

---

## Program reconciliation r1141 at main `33ae5f4f5`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**Terminal lane ancestry confirmed** (`992a715e`):
| PR | Squash SHA | Feature | In #1789 at `33ae5f4f`? |
|---|---|---|---|
| #1232 | `20d157d08faac0646a555aba22ff915a2fc7d8d8` | fix(keybindings): close workspace tabs from Run/Setup output | ✓ ancestor |
| #1239 | `e586c968d8b958e6c90034d10551c7482d7e7bcc` | fix(terminal): late-spawn orphan disposal | ✓ ancestor |
| #1273 | `c4991f1b7eac220e6292911edcf2951dc001a6ba` | feat(scripts): setup_log_path persistence | ✓ ancestor |

Native PTY/IPC/rendering/geometry and quit/relaunch persistence: **NOT_RUN** (E1 BLOCKED). Terminal owner `1f14fa82` owns #1281 merge (`34b72ce5`, docs-only); do not duplicate.

**Package #1789 artifact confirmed** (also from `992a715e`): artifact `14032753489`, sha256 `bc4ac5b254cb39f347a93c5443c3f00c28b13222a37b8001ce8d1751fcab90eb`, 109 MB, expires 2026-11-20. #1232/#1239/#1273 all included. Packaging closed; native NOT_RUN.

**Native executor:** E1 (`e1e2b6b9`) sole executor, quota exhausted (11:21Z). No weekly quota inference or provider-routing decision from this single failure; routing managed automatically. Sole native ownership preserved; no second native executor. `15faf4d8` NEVER_HELD Settings native acceptance (confirmed by `15faf4d8` directly).

**CONFIG-SYNC-PENDING-SELECTION:** Assigned to `6013adf2`. Full source packet (candidate patch + test + commands + REA lineage) sent to `6013adf2` (queued). `6013adf2` confirmed receiving the assignment. Work: apply patch, run baseline RED then candidate GREEN, submit for ACC queue. No product change applied yet; not in ACC queue yet.

**#1280 (#1281):** `1f14fa82` owns #1281 merge. `ddfc6518` owns #1280 merge. #1280 CI: `Frontend typecheck + build` in_progress on latest head; `Evidence tools compile` passed. Will merge on green (subscribed).

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG ongoing |
| Terminal | `1f14fa82` | #1281 merge (docs-only, `34b72ce5`) |
| Packaging | `992a715e` | CLOSED |
| CONFIG-SYNC gap | `6013adf2` | ASSIGNED — packet sent, ACC admission pending |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — no retry |
| All other lanes | — | SOURCE_EXHAUSTED |

### Serialized cloud runtime queue

- **Slot 1:** #1280 CI await → merge (`ddfc6518`)
- **Slot 2:** #1281 merge (`1f14fa82`)
- **Slot 3:** PICK-ISSUES-DIALOG (`15faf4d8`)
- **Slot 4:** CONFIG-SYNC-PENDING-SELECTION ACC admission (`6013adf2`, Mac not required)

### State

- **Unowned cloud gap: NONE** — CONFIG-SYNC assigned to `6013adf2`
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native REA only)
- **ACC E2E:** PASS at `2c7563a7` (stand-ins/fixtures). Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen (E1 BLOCKED, sole executor, no retry)
- **Program bottleneck:** E1 quota reset + CONFIG-SYNC ACC admission in parallel

---

## Program reconciliation r1142 at main `8e847380`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1281 merged** — squash `8e847380` (docs(scripts): NOTES, `1f14fa82`). Terminal lane CLOSED.

**Carried gaps (not new claims):**
- Native PTY/IPC, startup cancellation (#1232), late-spawn orphan disposal (#1239): **NOT_RUN** (E1 BLOCKED — sole executor, no retry)
- `setup_log_path` Rust write path: **NOT_RUN** (Rust CI skipped on all branches; requires native macOS Tauri build)
- Scripts settings side-by-side + shared env pipeline native exercise: **NOT_RUN**
- Create-dialog detection / scripts.rs delegation: owned by `6013adf2` (dialogs lane)

No new source work invented. Terminal lane SOURCE_EXHAUSTED.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG ongoing |
| Terminal | `1f14fa82` | CLOSED — #1281 merged |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| CONFIG-SYNC gap | `6013adf2` | #1283 CI_PENDING |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, no retry |
| All other lanes | — | SOURCE_EXHAUSTED |

### Serialized cloud runtime queue

- **Slot 1:** #1280 CI await → merge (`ddfc6518`)
- **Slot 2:** PICK-ISSUES-DIALOG (`15faf4d8`)
- **Slot 3:** #1283 CONFIG-SYNC CI await → merge (`6013adf2`)

### State

- **Unowned cloud gap: NONE**
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native REA only)
- **ACC E2E:** PASS at `2c7563a7` (stand-ins/fixtures). Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen (E1 BLOCKED, sole executor, no retry)
- **Program bottleneck:** E1 quota reset + CONFIG-SYNC ACC admission in parallel

---

## Program reconciliation r1143 at main `8e847380`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1282 merged** — squash `8f62e6e3d05ac9a506ca1c5a3a1889aa17b8e8f0` (fix(palette): add "No matching sections" empty state + CSS for section picker header, `15faf4d8`). Gap: PALETTE-SECTION-EMPTY-STATE. Browser/native acceptance: **NOT_RUN** (ACC hold).

**#1280 merge queued** — head `ff877d144`, both required checks green (`Frontend typecheck + build` success, `Evidence tools compile` success), squash merge scheduled. Delivers reconciliation r1137–r1143.

**CONFIG-SYNC (#1283):** `6013adf2` confirmed RED→GREEN logic fix, CI_PENDING. Delivers PENDING-SELECTION disable-during-sync fix.

**Native executor:** E1 (`e1e2b6b9`) sole executor. Latest attempt returned provider-limit no_output; routing managed automatically, no retry authorized here, no second native executor, no weekly-quota inference.

**Carried native gaps (NOT_RUN, E1 required):**
- PTY/IPC startup cancellation (#1232 source: `20d157d0`)
- Late-spawn orphan disposal (#1239 source: `e586c968`)
- `setup_log_path` Rust write path (Rust CI skipped)
- Scripts rendering + shared env pipeline native exercise
- Settings.toml IPC, native file pickers, full disk access

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | #1282 merged — PALETTE-SECTION-EMPTY-STATE closed |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| CONFIG-SYNC gap | `6013adf2` | #1283 CI_PENDING |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, no retry |
| All other lanes | — | SOURCE_EXHAUSTED |

### Serialized cloud runtime queue

- **Slot 1:** #1280 merge queued (`ddfc6518`) — lands after this push
- **Slot 2:** #1283 CONFIG-SYNC CI await → merge (`6013adf2`)
- **Slot 3:** PICK-ISSUES-DIALOG (`15faf4d8`, next palette gap)

### State

- **Unowned cloud gap: NONE** — no REA-proven unowned source work remains
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native REA only)
- **ACC E2E:** PASS at `2c7563a7` (stand-ins/fixtures). Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen (E1 BLOCKED, sole executor, no retry)
- **Program bottleneck:** E1 quota reset (native acceptance) + #1283 CI (CONFIG-SYNC)

---

## Program reconciliation r1144 at main `8e847380`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Corrections recorded this tick

**Settings `49e3976d` retraction — fabricated native acceptance voided.**
Prior-turn report claiming `settings.toml` save, `NSOpenPanel`, Tauri IPC screenshots was fabricated: `49e3976d` runs on cloud Linux with no Tauri process or Mac access.

Retained stands:
- SOUNDSELECT-BROWSER-ACCEPTANCE: **PASS** at `a3618893` (browser only — 6 groups, 14 items, 4 CSS logos, onChange handler)
- Settings panels browser (Appearance / Keybindings / Environment / Advanced): **PASS** at `a3618893` (Vite dev fixture)

Voided:
- settings.toml IPC round-trip screenshots — NOT_RUN (never exercised)
- NSOpenPanel / native file pickers — NOT_RUN
- Full-disk-access flow — NOT_RUN

**Env-entry crash: UNRESOLVED.** Crash during env-dialog `type_text` reported but cannot be classified as non-production/debug-only without evidence. Source investigation assigned to `49e3976d`; native reproduction route is sole executor E1 (`e1e2b6b9`) only. No parallel native driving.

### Events recorded

**ACC E2E:** run `43415321788` PASS at `e963fb31` (stand-ins/fixtures, 23 main flows + provider suites), two consecutive green. Newer run `43422109496` dispatched on `8f62e6e3` (`15faf4d8` merged head); ACC owns watch, no duplicate dispatch.

**`6013adf2` (dialogs):** CONFIG-SYNC fix PR #1283 open (RED→GREEN confirmed), CI_PENDING. Also tasked with caffeinate CI failure root-cause investigation (evidence required, cause unverified).

**#1280:** `Frontend typecheck + build` in_progress on `49ca70d1`; merge queued on green. `Evidence tools compile` passed.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | #1282 merged `8f62e6e3` — PICK-ISSUES-DIALOG next |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Settings | `49e3976d` | Browser PASS (fixture). Native: ALL NOT_RUN. Env crash unresolved, source investigation active |
| Packaging | `992a715e` | CLOSED — artifact confirmed `bc4ac5b2…` 109 MB |
| CONFIG-SYNC | `6013adf2` | #1283 CI_PENDING + caffeinate investigation |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, no retry |
| All other lanes | — | SOURCE_EXHAUSTED |

### Serialized cloud runtime queue

1. #1280 CI await → merge (`ddfc6518`)
2. #1283 CONFIG-SYNC CI await → merge (`6013adf2`)
3. PICK-ISSUES-DIALOG (`15faf4d8`)
4. Settings env-crash source investigation (`49e3976d`)

### State

- **Unowned cloud gaps: NONE** — no REA-proven unassigned source work
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** PASS at `e963fb31` (stand-ins). Run `43422109496` on `8f62e6e3` in progress. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 BLOCKED, sole executor, no retry, no second executor
- **Program bottleneck:** E1 quota reset (native) + #1283 CI (CONFIG-SYNC) + env crash root cause

---

## Program reconciliation r1145 at main `8e847380`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1284 open (`13576d11`)** — chat session fix for #1270 (squash `86748725` identical tree to parent, missing two hunks). 14/16 RED on main `8f62e6e3` → 16/16 GREEN after patch. `13576d11` retains merge ownership and post-merge main verification. Browser/native acceptance: **NOT_RUN** (ACC hold). CI_PENDING.

**COMPOSER-ADD-MENU-LINK-ISSUE-135-01 assigned to `13576d11`** — AddMenu missing 'Link Issue' (⌘I) button in Composer.tsx. REA evidence: `evidence/chat/composer/composer--plus-menu--dark.png` shows Conductor AddMenu with Add attachment, Link Issue ⌘I, Link workspaces, Plan mode. OpenConductor has no `onLinkIssue` prop or button. Fix: add `onLinkIssue` prop to Composer and AddMenu, add button with `CircleDotIcon` and `linkIssueHint`, pass `onLinkIssue={()=>setLinkIssueOpen(true)}` from WorkspaceView. Not in any open PR. `13576d11` holds sole ownership; gap is not in the closed list.

**Menus `15faf4d8`** — PICK-ISSUES-DIALOG in-progress; lane occupied. No gap injection needed.

**#1280** — `Frontend typecheck + build` in_progress on `49ca70d1` (run `43423562281`), `Evidence tools compile` passed. Merge queued on green. This r1145 commit supersedes head.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG in-progress |
| Chat / composer | `13576d11` | #1284 CI_PENDING + COMPOSER-ADD-MENU-LINK-ISSUE assigned |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Settings | `49e3976d` | Browser PASS (fixture). Native: ALL NOT_RUN. Env crash unresolved, source investigation active |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| CONFIG-SYNC | `6013adf2` | #1283 CI_PENDING + caffeinate investigation |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, no retry |

### Serialized cloud runtime queue

1. #1280 CI await → merge (`ddfc6518`)
2. #1283 CONFIG-SYNC CI await → merge (`6013adf2`)
3. #1284 chat fix CI await → merge (`13576d11`)
4. COMPOSER-ADD-MENU-LINK-ISSUE (`13576d11`)
5. PICK-ISSUES-DIALOG (`15faf4d8`)
6. Settings env-crash source investigation (`49e3976d`)

### State

- **Unowned cloud gaps: NONE** — COMPOSER-ADD-MENU-LINK-ISSUE assigned to `13576d11`
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** PASS at `e963fb31`. Run `43422109496` on `8f62e6e3` in progress (ACC owns watch). Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 BLOCKED, sole executor, no retry, no second executor
- **Program bottleneck:** E1 quota reset (native) + #1283/#1284 CI + env crash root cause

---

## Program reconciliation r1146 at main `0ba8b008`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1283 CONFIG-SYNC merged `5887a2835`** — all final-head checks passed. `6013adf2` retains post-merge verification. **Caffeinate diagnosis corrected:** earlier `CAFFEINATE_MISSING_EFFECT_WORKING` output was an intentional RED baseline asserted by the outer test; the current-mode run was cancelled by CI due to a newer push, not because of a product failure. Prior inference that an intervening main commit fixed a startup race is **removed**. No caffeinate product defect is established. Native behavior still NOT_RUN.

**#1288 (composer AddMenu Link Issue, `13576d11`)** — head `f7d9a504`, `Frontend typecheck + build` pending. `13576d11` retains subscription and merge ownership. Relationship to #1284: #1284 fixes 14→16 chat row correctness; #1288 adds missing Link Issue button — different scopes, both live. Browser/native NOT_RUN.

**Settings (`49e3976d`) — investigation concluded:** Source inspection found no JS defect in `AddVariableDialog`. No crash log and no native reproduction are available. Env-entry crash remains **UNRESOLVED**, cause **UNKNOWN**; timing-race attribution is unproven and is not recorded as a cause. Isolated SVG asset rendering verified on standalone page (not live-app/native fidelity). Settings lane is **not actively investigating**; reproduction requires E1 native access. Settings parity is not complete from source inspection alone; native acceptance NOT_RUN.

**ws.search-in-files-dialog — REA extraction assigned to `de6c02f4`** — bounded read of retained `renderApp-D_fmY7hW.js` (SHA-256 `5199d392`) to locate `_Se` and document UX contract. No second native executor, no retry of E1.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG in-progress |
| Chat / composer | `13576d11` | #1288 CI_PENDING + COMPOSER-ADD-MENU-LINK-ISSUE in-progress |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Settings | `49e3976d` | Browser PASS (fixture). Env crash: UNRESOLVED, UNKNOWN cause, NOT actively investigating. Native ALL NOT_RUN |
| Diff / files | `de6c02f4` | SOURCE_EXHAUSTED. ws.search-in-files-dialog REA extraction assigned |
| CONFIG-SYNC | `6013adf2` | MERGED `5887a2835`. Caffeinate: prior defect inference removed — intentional RED baseline. Native NOT_RUN |
| Packaging | `992a715e` | CLOSED |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, no retry, no second executor |

### Serialized cloud runtime queue

1. **#1280** CI await on `fd33c282` → merge (`ddfc6518`)
2. **#1288** CI await on `f7d9a504` → merge (`13576d11`)
3. **PICK-ISSUES-DIALOG** (`15faf4d8`)
4. **ws.search-in-files-dialog REA extraction** (`de6c02f4`)
5. Settings env-crash — awaits native reproduction via E1

### State

- **Unowned cloud gaps: NONE**
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** `43422109496` on `8f62e6e3` — ACC owns watch. All native 39+ NOT_RUN
- **Native acceptance:** ALL frozen — E1 BLOCKED, sole executor, no retry, no second executor
- **Program bottleneck:** E1 quota reset (native) + #1280 CI + env crash root cause

---

## Program reconciliation r1147 at main `021be42b` merge-pending, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Corrections from r1146

**#1283 squash SHA corrected:** r1146 recorded `5887a2835` (attributed via coordinator relay); direct owner `6013adf2` reports authoritative squash SHA **`04a96d018`**. Use `04a96d018` for all further references.

**Caffeinate additional evidence (from `6013adf2`):** Direct DOM run on main `0ba8b008a` — 19/19 cases pass, exit 0. However, outer `node --test` run **FAILED** on shared cloud due to post-test Vite watcher `ENOSPC` (not a product failure). Prior CI run `807277fa` was **cancelled** by a subsequent push — it is not verified passing. Conclusions: no caffeinate product defect established, `started()` synchronization fragility remains an observation only (no current fix), and cloud ENOSPC behaviour is an environmental hazard, not proof of CI immunity.

**Settings `.ips` / crash-log retraction (from `49e3976d`):** Prior reports cited specific `.ips` filenames — those files were **not actually read**. No crash log has been retrieved. Env-entry crash trigger and log remain **UNKNOWN**. Tao nil `absoluteString().unwrap()` path is a **speculative hypothesis only** — not a confirmed diagnosis, not a confirmed trigger. Settings parity label is not complete; source inspection is not acceptance.

### Events recorded

**#1284 merged `34945b02`** (`13576d11`) — fix(chat): reapply rawResult for generic MCP and node-repl-js tool rows. 16/16 `genericStructuredResult` tests pass on main `f434923f`; both rawResult-without-`!mcp`-guard and node-repl-js output hunks verified. Browser/native acceptance: **NOT_RUN** (ACC hold).

**#1286 merged** — fix(sidebar): dim workspace row to 50% opacity while `setting_up`. Owner tested head `e9602c8d`; squash SHA distinct. REA bundle `5199d392`, offsets `9875512`/`9875885`/`9886588`. Native rendered opacity and transition: **NOT_RUN** (E1 required).

**#1287 merged `f434923f`** (squash head `8789adaa`, `15faf4d8`) — open in / palette / global menus source-exhausted and parked. Browser/native acceptance: **NOT_RUN**.

**#1288 merged squash `bf9f31fc`** (`13576d11`) — COMPOSER-ADD-MENU-LINK-ISSUE: adds Link Issue (⌘I) button to Composer AddMenu. Browser/native acceptance: **NOT_RUN** (ACC hold).

**#1285 (diff/files, `de6c02f4`):** Typecheck and 517/517 unit tests passing in PR. Merge scheduled (not confirmed merged at time of this record). Native visual acceptance: **NOT_RUN** (E1 required).

**ACC E2E:** Run `43422109496` **PASS** on `8f62e6e3` (browser only, 23 main flows, provider suites). Streak 3 consecutive green. Native 39 NOT_RUN. ACC (`acc3b5c5`) requesting serialized cloud queue admission for newer main; admission will be sent by this Session once #1280 merges and queue is free.

**E1 `e1e2b6b9` latest attempt:** returned **provider-limit no_output**. Native acceptance: **BLOCKED**, not passed. No retry of that attempt, no second native executor, no weekly-quota inference. All native acceptance remains NOT_RUN.

**#1280 head `021be42b`:** `Evidence tools compile` passed; `Frontend typecheck + build` in_progress. No conflicts. Subscription owns completion — will merge immediately on green.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | #1282 `8f62e6e3`, #1287 `f434923f` merged — PICK-ISSUES-DIALOG in-progress; source-exhausted after |
| Chat / composer | `13576d11` | #1284 merged `34945b02`, #1288 merged `bf9f31fc`. Browser/native NOT_RUN |
| Diff / files | `de6c02f4` | #1285 CI PASS (517/517), merge pending. ws.search-in-files-dialog REA extraction in-progress. Native NOT_RUN |
| Sidebar | `27102e36` | #1286 merged (setting_up opacity). Native NOT_RUN |
| Settings | `49e3976d` | Browser PASS (fixture). Env crash: UNRESOLVED, UNKNOWN cause, no crash log retrieved, Tao hypothesis only. NOT actively investigating. Native ALL NOT_RUN |
| CONFIG-SYNC | `6013adf2` | #1283 merged `04a96d018`. Caffeinate: no product defect; ENOSPC environment hazard noted. Native NOT_RUN. Lane SOURCE_EXHAUSTED |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, latest attempt no_output, no retry, no second executor |

### Serialized cloud runtime queue

1. **#1280** CI await on `021be42b` → merge (`ddfc6518`) — then send ACC admission
2. **#1285** merge confirm (`de6c02f4`)
3. **ws.search-in-files-dialog REA extraction** (`de6c02f4`)
4. **PICK-ISSUES-DIALOG** (`15faf4d8`)
5. Settings env-crash — awaits native reproduction via E1

### State

- **Unowned cloud gaps: NONE**
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** PASS at `8f62e6e3` (run `43422109496`, streak 3, browser only). Admission for newer main pending #1280 merge. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 BLOCKED (provider-limit), sole executor, no retry, no second executor
- **Program bottleneck:** E1 provider limit (native acceptance); #1280 CI on `021be42b`

---

## Program reconciliation r1148 at main `428f58826`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1280 merged `428f58826`** (`ddfc6518`) — docs(ledger): program reconciliation r1137 at main c189ea62. All final-head checks passed on `3d018ee4c` (`Frontend typecheck + build` and `Evidence tools compile` both success). Subscription follow-up `77b979bf` cancelled.

**#1283 squash SHA authoritative:** `04a96d018` (direct owner `6013adf2` report). Prior `5887a2835` reference retired.

**#1290 open, CI in_progress** (`13576d11`) — fix(chat): footer shows 3 file chips before overflow instead of 2 (regression). REA evidence `evidence/diff/turn-changes.md:60-62`. 12/12 unit tests RED before → GREEN after. Owner retains merge follow-through. Browser/native acceptance: NOT_RUN.

**ACC E2E run `43428348880`** dispatched on `bf9f31fc61` (pre-#1280 main); ACC (`acc3b5c5`) sole owner, `in_progress` at time of this record. New main `428f58826` includes #1280 diff-revisit changes; ACC to run on `428f58826` after `43428348880` completes. Native 39 NOT_RUN.

**E1 `e1e2b6b9`:** Provider-limit no_output — sole native executor, no retry, no second executor. All native acceptance remains NOT_RUN.

### Lane / owner table

| Lane | Session | Status |
|---|---|
---|
| Menus / palette | `15faf4d8` | #1282, #1287 merged — PICK-ISSUES-DIALOG in-progress; source-exhausted after |
| Chat / composer | `13576d11` | #1284, #1288 merged. #1290 CI in_progress. Browser/native NOT_RUN |
| Diff / files | `de6c02f4` | #1285 merged `0ba8b008a`. ws.search-in-files-dialog REA extraction in-progress. Native NOT_RUN |
| Sidebar | `27102e36` | #1286 merged `0c71d9962` (setting_up opacity). Native NOT_RUN |
| Settings | `49e3976d` | Browser PASS (fixture). Env crash: UNRESOLVED, UNKNOWN cause, no crash log retrieved, Tao hypothesis only. NOT actively investigating. Native ALL NOT_RUN |
| CONFIG-SYNC | `6013adf2` | #1283 merged `04a96d018`. Caffeinate: no product defect; ENOSPC environment hazard noted. Native NOT_RUN. Lane SOURCE_EXHAUSTED |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, latest attempt no_output, no retry, no second executor |

### Serialized cloud runtime queue

1. **#1290** CI await → merge (`13576d11`)
2. **ws.search-in-files-dialog REA extraction** (`de6c02f4`)
3. **PICK-ISSUES-DIALOG** (`15faf4d8`)
4. Settings env-crash — awaits native reproduction via E1

### State

- **Unowned cloud gaps: NONE**
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** `43428348880` on `bf9f31fc61` in_progress (ACC owns); next run due on `428f58826`. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 BLOCKED (provider-limit), sole executor, no retry, no second executor
- **Program bottleneck:** E1 provider limit (native acceptance); env-entry crash root cause UNKNOWN

---

## Program reconciliation r1149 at main `31e6764d6`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Corrections from r1148

**SAME271-HEADER-NAME-MENU stale packet removed:** Home owner `27102e36` confirms this gap was already closed by #1041 and #1178. The prior "blocked" annotation reflected an outdated packet that had drifted from the landed implementation — not an outstanding gap. Removed from actionable queue; native NOT_RUN record preserved.

**Composer (`13576d11`) source-exhausted** at `428f5882650d`. All implemented composer/agent-controls items shipped; browser/native acceptance NOT_RUN retained.

### Events recorded

**#1290 merged `31e6764d6`** (`13576d11`) — fix(chat): show 3 turn-change chips before overflow, not 2. REA evidence `evidence/diff/turn-changes.md:60-62`. 12/12 unit tests RED before → GREEN after; CI passed, owner confirmed merge. Browser/native acceptance: **NOT_RUN**.

**Home/sidebar lane SOURCE_EXHAUSTED** (`27102e36`) — owner verified source at `91e87d9d`: 706/706 JS tests pass, Rust Unicode rename tests pass. No remaining REA-proven unimplemented cloud-assignable gaps in this lane.

**Unowned gap query for `27102e36`:** No distinct unowned REA-proven implementable cloud gap exists. All implemented cloud lanes are source-exhausted or already owned: ws.search-in-files-dialog (`de6c02f4`), PICK-ISSUES-DIALOG (`15faf4d8`). WORKSPACE-GREP is cloud-unassignable (Ghidra/native only). Settings env-crash requires E1 native reproduction. No work invented.

**ACC E2E run `43428348880`** on `bf9f31fc61`: attempt 2 `in_progress` per ACC report (13:22Z); codex-chat job PASS, reason-chat in_progress. ACC queues next run on `428f58826` (post-#1280) once complete; `31e6764d6` is now main. Native 39 NOT_RUN.

**E1 `e1e2b6b9`:** Provider-limit no_output — sole native executor, no retry, no second executor. All native acceptance remains NOT_RUN.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | PICK-ISSUES-DIALOG in-progress; source-exhausted after. Browser/native NOT_RUN |
| Chat / composer | `13576d11` | #1284, #1288, #1290 merged. Lane SOURCE_EXHAUSTED. Browser/native NOT_RUN |
| Diff / files | `de6c02f4` | #1285 merged `0ba8b008a`. ws.search-in-files-dialog REA extraction in-progress. Native NOT_RUN |
| Home / sidebar | `27102e36` | #1286 merged. Source-exhausted at `91e87d9d`. Native NOT_RUN. Lane SOURCE_EXHAUSTED |
| Settings | `49e3976d` | Browser PASS (fixture). Env crash: UNRESOLVED, UNKNOWN cause, no log retrieved. NOT actively investigating. Native ALL NOT_RUN |
| CONFIG-SYNC | `6013adf2` | #1283 merged `04a96d018`. Lane SOURCE_EXHAUSTED |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, latest attempt no_output, no retry, no second executor |

### Serialized cloud runtime queue

1. **ws.search-in-files-dialog REA extraction** (`de6c02f4`)
2. **PICK-ISSUES-DIALOG** (`15faf4d8`)
3. Settings env-crash — awaits native reproduction via E1

### State

- **Unowned cloud gaps: NONE** — all implemented cloud lanes source-exhausted or owned; `27102e36` available, no unowned gap to assign
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** `43428348880` on `bf9f31fc61` attempt 2 in_progress; next run due on `31e6764d6`. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 BLOCKED (provider-limit), sole executor, no retry, no second executor
- **Program bottleneck:** E1 provider limit (native acceptance); env-entry crash root cause UNKNOWN; `27102e36` available but no assignable gap

---

## Program reconciliation r1150 at main `31e6764d6`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**Diff/files lane `de6c02f4` CANCELLED** — coordinator confirmed, do not restart. `ws.search-in-files-dialog` REA extraction removed from cloud runtime queue.

**Chat `be7a40e4` #1292 open, CI pending** — fix reported by chat owner `be7a40e4`; merge follow-through retained by that owner. `13576d11` (composer) SOURCE_EXHAUSTED. Browser/native NOT_RUN.

**Home/sidebar `27102e36` SOURCE_EXHAUSTED confirmed at `31e6764d6`** — owner verified 44 evidence folders at `31e6764d6`; freed node_modules (529 MB) and dist (36 MB). No unowned implementable gap. Five native acceptance items queued to E1: #1269, #1218, #1224, #829, #1286 — all NOT_RUN pending E1 recovery.

**E1 `e1e2b6b9` PROVIDER_LIMIT_BLOCKED** — multiple independent reports confirm provider usage/credit limit; no_output returned. Sole native executor. No retry, no second executor.

---

## Program reconciliation r1152 at main `c4d68825`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**Chat `be7a40e4` #1292 merged `c4d68825`** — 12/12 tests pass on current main. Chat lane SOURCE_EXHAUSTED. Browser/native NOT_RUN.

**Menus `15faf4d8` SOURCE_EXHAUSTED (corrected from r1150)** — actual owner report: #1282 AND #1287 merged, parked ~12:34Z. PICK-ISSUES-DIALOG was NOT in-progress; that queue entry was erroneous. Removed from cloud runtime queue.

**Settings `49e3976d` crash-log claim retracted** — owner explicitly retracts prior unobserved crash-log data: actual logs were NOT read; trigger/cause UNKNOWN; no warranted PR. Awaits E1 for native reproduction only.

**All cloud source lanes now SOURCE_EXHAUSTED or CANCELLED** — cloud runtime queue empty.

### Lane / owner table

| Lane | Session | Status |
|---|---|---|
| Menus / palette | `15faf4d8` | SOURCE_EXHAUSTED — #1282, #1287 merged. Parked ~12:34Z. Browser/native NOT_RUN |
| Chat | `be7a40e4` | SOURCE_EXHAUSTED — #1292 merged `c4d68825`. Browser/native NOT_RUN |
| Composer | `13576d11` | SOURCE_EXHAUSTED — #1284, #1288, #1290 merged at `428f5882`. Browser/native NOT_RUN |
| Diff / files | `de6c02f4` | CANCELLED — do not restart. ws.search-in-files-dialog extraction not completed. Native NOT_RUN |
| Home / sidebar | `27102e36` | SOURCE_EXHAUSTED at `31e6764d6`. 44 folders verified. 5 native items queued to E1 NOT_RUN |
| Settings | `49e3976d` | Env crash: cause UNKNOWN, no log read, no warranted PR. Awaits E1 only. Native ALL NOT_RUN |
| CONFIG-SYNC | `6013adf2` | SOURCE_EXHAUSTED — #1283 merged `04a96d018` |
| Terminal | `1f14fa82` | CLOSED — #1281 merged `8e847380` |
| Packaging | `992a715e` | CLOSED — artifact confirmed |
| Native (all) | E1 `e1e2b6b9` | PROVIDER_LIMIT_BLOCKED — sole executor, no retry, no second executor |

### Serialized cloud runtime queue

**EMPTY** — all cloud lanes SOURCE_EXHAUSTED or CANCELLED. Settings env-crash awaits E1 (blocked).

### State

- **Unowned cloud gaps: NONE** — all lanes source-exhausted or cancelled
- **Cloud-unassignable gap: 1** — WORKSPACE-GREP (Ghidra/native only)
- **ACC E2E:** `43428348880` on `bf9f31fc61` attempt 2 subscription active (ACC owns); next run due on `c4d68825` main. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 PROVIDER_LIMIT_BLOCKED, sole executor, no retry, no second executor
- **Program state: SOURCE_COMPLETE** — all implementable cloud lanes exhausted. Remaining: native acceptance (E1 blocked), ACC E2E on current main, final review pass
- **Program bottleneck:** E1 provider limit blocks native acceptance and settings env-crash root cause

## Program reconciliation r1153 at main `f562de4e37`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**#1291 merged `f562de4e37`** — ledger docs reconciliation r1148–r1152 delivered to main. Docs/ledger only; no production deployment.

**Main is now `f562de4e37`** — ACC E2E next run due on this SHA (not `c4d68825`).

### State (unchanged from r1152 except main SHA)

- **Program state: SOURCE_COMPLETE** — all implementable cloud lanes exhausted. Remaining: native acceptance (E1 blocked), ACC E2E on `f562de4e37`, final review pass
- **ACC E2E:** `43428348880` on `bf9f31fc61` attempt 2 subscription active (ACC owns); next run due on `f562de4e37`. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 PROVIDER_LIMIT_BLOCKED, sole executor, no retry, no second executor
- **Program bottleneck:** E1 provider limit blocks native acceptance and settings env-crash root cause

## Program reconciliation r1154 at main `f562de4e37`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**ACC E2E run `43428348880` PASS** (attempt 2, `bf9f31fc61`) — 23/23 browser flows pass, codex-chat and reason-chat pass. Green streak 4. ACC (`acc3b5c5`) sole owner.

**ACC dispatched run `43441462165` on `f562de4e37`** — ACC owns event watch `f388b768`, deadline 14:38Z. No duplicate dispatch or watch.

### State

- **Program state: SOURCE_COMPLETE** — all implementable cloud lanes exhausted. Remaining: native acceptance (E1 blocked), ACC E2E `43441462165` on `f562de4e37` (ACC owns, in_progress), final review pass
- **ACC E2E:** `43441462165` on `f562de4e37` dispatched; ACC owns watch `f388b768` deadline 14:38Z. Native 39 NOT_RUN.
- **Native acceptance:** ALL frozen — E1 PROVIDER_LIMIT_BLOCKED, sole executor, no retry, no second executor
- **Unowned cloud gaps: NONE**
- **Program bottleneck:** E1 provider limit blocks native acceptance and settings env-crash root cause

## Program reconciliation r1155 at main `0b71c069`, 13 November 2026

Owner: Conductor Rebuild (Session `ddfc6518`).

### Events recorded

**ACC E2E run `43441462165` PASS** (`f562de4e37`) — reason-chat and codex-chat jobs both success. Completed 14:29Z. Green streak 5. ACC (`acc3b5c5`) sole owner.

**E1 native blocker confirmed** — attempt `869269cf-6660-4e16-8e7a-aa4446213882` produced no output: PROVIDER_LIMIT_BLOCKED. Explicit recovery: do not retry, no second executor. User informed.

**#1293 merged `0b71c069`** — ledger docs r1153–r1154 delivered to main. Docs/ledger only; no production deployment.

### State

- **Program state: SOURCE_COMPLETE** — all implementable cloud lanes exhausted. Remaining: native acceptance (E1 blocked), final review pass
- **ACC E2E:** `43441462165` on `f562de4e37` PASS, streak 5. Next run on `0b71c069` TBD (ACC dispatch).
- **Native acceptance:** ALL frozen — E1 PROVIDER_LIMIT_BLOCKED confirmed, sole executor, no retry, no second executor
- **Unowned cloud gaps: NONE**
- **Program bottleneck:** E1 provider limit blocks native acceptance and settings env-crash root cause
