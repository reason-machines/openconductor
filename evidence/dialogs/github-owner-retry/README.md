# GitHub owner reconciliation after retry

Conductor Rebuild, 10 November 2026. This increment keeps the selected GitHub owner inside the refreshed owners list. It does not change authentication, provider commands, repository creation, shared dialogs, or onboarding.

## Retained reference

The [inert reference packet](reference.json) contains complete definitions from already-retained Conductor 0.87.6 renderer bytes. The existing source owner rehashed the original asset before its bounded reads. This lane recovered the literal packet from its received Session message and verified every span's UTF-8 byte length and SHA-256 hash. The source is data and is never evaluated.

Renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its original REA receipt is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The analyzer skipped this large renderer at heap exhaustion, so that semantic graph is not the proof. These complete retained literal reads are the proof:

- `Aos`, UTF-8 half-open bytes `[1981992,1982600)`, reads the signed-in personal login first. An organizations error returns that personal owner plus `orgsError`. A subsequent request reads the signed-in login again.
- `H3i`, `Ros`, `Nos`, and `e7t`, `[1983084,1983759)`, connect the owners query to `Aos` and name availability to `Ios`. An owners result with an organizations error has zero stale time.
- Complete `was`, `[2028894,2035857)`, exposes Try again when the organizations request failed. Its displayed owner is the selected login only when the current owners list still contains it. Otherwise it uses the first login or an empty string. That derived owner also feeds availability and the create mutation.
- `Ios`, `[1982600,1983084)`, checks the supplied owner and repository name. The immediate `dbi` wrapper, `[2028481,2028894)`, supplies the dialog body without a different owner reconciliation rule.

Original received source is retained in [this Session](https://reasonmachines.com/agents/6013adf2-e94a-4a6d-9be7-bbd07622cf3c), source `46f1c5bc-06b1-434d-a5da-7254ccce6bc1`, revision `26194408`, from artifact owner [be7a40e4](https://reasonmachines.com/agents/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b). All five byte spans and hashes are recorded in the packet.

## Current-main discrepancy

Fetched main `4a4a35899c007be0c7d0597fcf8df13c9b252601` uses `setOwner((cur) => cur || value.owners[0]?.login || "")` after every successful owners load. Once an owner is selected, this retains its login even when the refreshed list no longer contains it.

The existing Try again path makes this reachable. An initial personal owner with an organizations error exposes Retry. If its next owners result contains a different signed-in personal login, the current component displays and checks the old login. This is a controlled source-level schedule, not an observed real authentication change. The Rust owners producer reads the current personal login on each request and returns that login with an organizations error, matching the fixture's result shapes.

The proposed correction keeps a selected login only when the refreshed result still contains it, otherwise choosing its first owner or an empty string. No callback, network command, or shared state model needs to change.

The ledger cleared `GITHUB-OWNER-RETRY-6013-01` for only the owner reconciliation line, its adjacent regression, and this evidence directory. No other product code is included.

## Regression checkpoint

`src/components/githubRepoOwners.test.ts` compiles and mounts the actual production `GitHubRepoDialog` with the existing React test renderer. It drives the actual Try again button, not a copied owner-selection function. Only the outer Modal and backend boundary are replaced. Availability timers are controlled inside the fixture. No global timers, storage, provider, filesystem, credentials, or native commands are used.

The regression covers a removed owner falling back before availability and creation, a still-valid owner surviving refresh, and initial empty selection remaining unable to submit until the first owner and its availability arrive. The two refresh results use valid personal-owner and organizations-error shapes. They do not perform authentication changes.

This first checkpoint changes tests and evidence only. Production stays unchanged until normal automatic hosted CI demonstrates the intended stale-login failure. The focused command is:

```bash
node --experimental-strip-types --test src/components/githubRepoOwners.test.ts
```

Passed locally on Reason Cloud:

```bash
node --experimental-strip-types --check src/components/githubRepoOwners.test.ts
node evidence/dialogs/github-owner-retry/verify-reference.mjs
git diff --check
```

The reference verifier passed all five source byte-length and SHA-256 checks without executing reference code. Test syntax and diff hygiene passed. Local component execution, installation, typecheck, build, browser, native launch, and provider operations were not run because this lane has no runtime admission. Automatic hosted RED and GREEN are not yet established. There is no screenshot. Source and future hosted component checks do not prove native or visual acceptance.
