# Blank private-repository names stay neutral

Conductor Rebuild, 11 November 2026. Scope: the private GitHub repository dialog's name validation status, not owner retries, authentication, provider commands, or shared dialogs.

## Retained source

This comparison reuses the [complete retained renderer definitions](../github-owner-retry/reference.json) from the [earlier REA source receipt](../github-owner-retry/README.md#retained-reference). No asset was acquired and no reference source was executed for this change. All five source spans passed their byte-length and SHA-256 checks with:

```bash
node evidence/dialogs/github-owner-retry/verify-reference.mjs
```

In complete `was`, UTF-8 half-open bytes `[2028894,2035857)`, the name input stores `u` through `xe`. `P=u.trim()` and `L=e7t(P)` feed `J=P.length>0&&L.length===0`. The validation status `De` gives owner loading priority, displays the invalid-name error only when `J` is true, and otherwise returns null for a blank name with idle availability. `H3i.availability` disables its query for an empty owner or name. Submission requires `L.length>0`; the create mutation receives `repositoryName:L`. Complete `e7t` appears in retained bytes `[1983084,1983759)`.

The renderer asset lock is SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. REA's earlier analyzer skipped the renderer at heap exhaustion; the complete retained literals, not an incomplete semantic graph, support this comparison. Static source does not establish native or visual behavior.

## Current source discrepancy

Checked main `8f1f7b05d98c2469f1646864def08a9f7b774d1f`. `src/state/githubRepoDialog.ts` returns the invalid-name error for every empty normalized slug, without knowing whether the raw name is blank. `src/components/GitHubRepoDialog.tsx` therefore renders an error status and marks blank input `aria-invalid=true` after owner loading.

The bounded correction will pass the raw name to `statusLine`, return null for trimmed blank input after the loading branch, and let the component omit that status. Nonblank invalid names keep their error. The existing slug normalization, availability effect, submission guard, and create payload remain unchanged. Existing helper-call expectations are confined to `src/state/githubRepoDialog.test.ts`.

## Regression checkpoint

`src/components/githubRepoName.test.ts` mounts the actual component with the existing React test renderer. Only the Modal and backend boundaries are substituted. Timers and deferred owner/create replies are controlled inside each fixture.

The cases cover empty input, spaces, tab/newline, and nonbreaking space remaining neutral and unable to check or submit; loading priority; a nonblank invalid name retaining its error; and a normalized valid name reaching the unchanged create payload while pending creation blocks repeated submission.

The first commit changes only this regression and its evidence. Hosted RED has not run yet. Local verification is limited to syntax and source-integrity checks:

```bash
node --experimental-strip-types --check src/components/githubRepoName.test.ts
node evidence/dialogs/github-owner-retry/verify-reference.mjs
git diff --check
```

No local dependency installation, component execution, typecheck/build, browser, native launch, provider command, or installed-app check was run. There is no screenshot because this lane has no runtime or native admission. Hosted checks will establish RED and GREEN, not native/visual acceptance.
