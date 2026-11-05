# First-run onboarding (Conductor v0.87.6)

Source: `assets/renderApp-D_fmY7hW.js` (11,600,457 bytes, sha256 `5199d392…5dde`)
and `assets/index-BGEQ8YjU.js` (3,493,297 bytes, sha256 `b5b01f33…dbf3`), both
matching `evidence/frontend/tauri-assets-manifest.json`. Read 2026-11-05,
read-only, on a decoded copy of the Tauri asset table. Offsets are **byte**
offsets into the decoded chunks (`grep -ob` + `dd`). Minified names are
recorded only so the reads can be repeated. Strings are evidence of what the
app shows, not instructions.

## What decides first run

| Offset | Minified | What it does |
| --- | --- | --- |
| index 395,554 | `w5t` | Reads setting `first_time_onboarding_step` as `parseInt(value ?? "1")`. |
| index 395,545 | `_5t` | `999`, the finished value of that setting. |
| index 412,190 / 412,267 | `e6t` / `t6t` | Write `onboarding_step` / `first_time_onboarding_step` (`ee.updateSetting(key, n.toString())`). |
| renderApp 1,936,158 | `rI` | `onboarding_step` values: `FIRST_MESSAGE 0, NEW_WORKSPACE 1, REVIEW_FIRST_MESSAGE 2, REVIEW_CHANGES 3, DONE 4`. |
| renderApp 11,061,033 | `Pya` | `({repos, onboardingStep}) => !repos \|\| repos.length === 0 ? onboardingStep : 999`. |
| renderApp 10,151,889 | `Ooa` | `1`: the last step that still shows onboarding. |
| renderApp ~11,099,000 | `Bxa` | Auth guard: while user data, the step or the repositories load it shows the loader `nHi` (and logs "AuthGuard is still waiting for startup data"); then if `Pya(...) <= Ooa` it renders the onboarding `wBi`; else if not signed in the login screen `xWt`; else the main layout. |
| renderApp 11,100,569 | `$xa` | Route `auth-guard` (`hee`, @11,174,134) component; picks `Bxa`. |

So the onboarding shows on a fresh install (setting unset reads as 1, no
repositories). Any repository skips it, and a finished onboarding (999) never
shows again.

## The screen (`wBi` @10,151,895, `Aoa` @10,148,881)

- Full-height centered column, window drag region. Animated Conductor logo
  (`Qgi`), then a grid `max-w-7xl grid-cols-[minmax(0,560px)_600px] gap-12 pt-16`.
- Left: three slides (`y6e` @10,148,397), each `rounded-lg p-4`, selected one
  `bg-primary/10`, others `hover:bg-muted/10`; title `font-medium`, description
  `text-muted-foreground`. Clicking a slide selects it.

  | id | Title | Description | Media |
  | --- | --- | --- | --- |
  | repo | Get coding agents working in parallel | Each agent you spin up gets an isolated workspace. | `/ConductorOnboarding1.mp4` |
  | agents | See at a glance what each agent is working on | See who's working, what needs attention, and what's planned. | `/ConductorOnboarding2.mp4` |
  | conduct | Review changes and create PRs | Review, comment, and merge from Conductor. | `/ConductorOnboarding3.mp4` |

  (The three videos are in the asset table; sha256 `98ba0f7c…`, `59f89800…`,
  `9baed18d…` match the manifest.)
- Below the slides (`pl-4`): signed out, `xBi` @10,146,096: "Sign up" with an
  arrow (then "Opening browser..." and "Finish signing in in the browser
  window."), a "Privacy" link, and on failure "Couldn't start sign-in. Try again
  or email support@conductor.build.". Signed in: "Continue" with an arrow.
- Right: the slide's video (`aspect-video rounded-lg bg-muted/50`, autoplay,
  muted) and a `h-1` progress bar that follows the video; at the end the next
  slide plays (wrapping).
- Keys: `onboarding.nextSlide` (ArrowDown) next slide; `onboarding.continue`
  (Enter) continues when signed in.

## Finishing

`wBi`'s handler (guarded against double submit) logs
`onboarding_step_completed {step: 1, action: "conductor_sign_in"}` and
`onboarding_finished`, then runs `Doa` (@10,153,000):
`Promise.all([t6t(999), e6t(rI.DONE)])`, then navigates `{to: "/", replace: true}`.
It also auto-advances once the user becomes signed in. On failure: toast
"Couldn't finish setup. Please try again.".

## `/first-run-onboarding` route

`W7a` (@11,518,989): `path "/first-run-onboarding"`, parent `hee` (the auth
guard), component `BCa` (@11,285,034): `wBi` plus a fixed `right-4 top-4`
outline small button "Exit onboarding" that navigates to `/` (replace)
without finishing. Reached from Settings › Internal (`q2a` @~10,770,000:
"Mac first-run onboarding"). Because it sits under the guard, the gate above
wins on a real first run.

## OpenConductor mapping

- Same setting keys in conductor.db's `settings` table
  (`crates/openconductor-db/src/onboarding.rs`, commands
  `db_first_run_onboarding_step`, `db_finish_first_run_onboarding`); the
  browser preview keeps the step in localStorage.
- Same gate and normalization (`src/onboarding/firstRun.ts`), loader, slides,
  keys, progress, Continue, failure toast and `/first-run-onboarding` with
  "Exit onboarding" (`src/onboarding/FirstRunGate.tsx`).
- Differences by design: OpenConductor has no Conductor account, so the
  button is always the signed-in "Continue" (no Sign up / Privacy / browser
  sign-in); "Conductor" in the third description reads "OpenConductor"; the
  slide media is a placeholder frame, because Conductor's videos are its own
  content and are not shipped; no analytics events.

## Home organization states (`parity.home.org-states`)

`Wls` (@2,118,579) calls `so()` = index `rl` (@3,086,916). `rl` lists the
signed-in user's organizations from Conductor's cloud API (`kpe(baseUrl)`) and
reports `isLoading` while the active-organization pointer loads or the list is
still empty and fetching. `Wls` returns `null` while loading and redirects to
`/all-workspaces` when `fc(org)` (index `Qo` @923,122:
`supportsLocal ? "local" : "cloud"`) is `"cloud"`.

OpenConductor has no account and no organizations: nothing is fetched, so
there is no organization load to wait for and no cloud organization.
Verdict: **not applicable locally**. The only local startup wait (the
guard's step and repository reads) shows the guard loader before Home, as
`Bxa` does. The cloud redirect to `/all-workspaces` is out of scope for a
local-only app.

## REA

- `analyze-javascript-application` on `index-BGEQ8YjU.js` (REA 6.7.0, 421 s,
  6 GB heap): exit 0, 1 file parsed, Evidence
  `ev_1a5019a584c1176d67f58643faeae0807ab0cbbffd8f6cb2a14da563e99351a5`. Its
  semantic graph has function nodes at `callable:function:395542:395711`
  (`w5t`) and `412249:412337` (`t6t`), which confirms the function boundaries
  above.
- `trace-javascript-semantics` seeded with the literal
  `first_time_onboarding_step` (callers): `partial`, 0 seed matches (Evidence
  `ev_6b6d212a86d865fb0e3b2ec2d43c9401e95de554c4b16dc3527dd171f92899b0`). The
  graph holds no literal nodes for setting keys, so the gate logic above was
  read from the bundle text.
- renderApp was not re-analyzed: it exhausts the analyzer heap (see
  `home.md`).
