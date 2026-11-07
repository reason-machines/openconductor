# Workspace header repository menu

Conductor Rebuild, 2026-11-07. This focused increment replaces the plain repository breadcrumb with its missing menu. It does not change official icons, the Home wordmark, workspace title/branch controls, Open in, palette selection, or native runtime isolation.

## Reference

The retained REA-extracted `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The installed binary identity was checked in the preceding [Home routing pass](../home-routing/README.md). This pass does not claim another native-app capture or rehash.

[Decoded excerpts](reference-static.json) show local header `ACi` renders `xoo`. Its repository button contains the repository icon and name, with a 192px maximum width. Its menu has Repository settings, targeting `/settings/repos/$repoId/misc`, and Open on GitHub only when `K9i` resolves a github.com remote. These are shipped JavaScript observations, not original source.

Parent REA `capture-browser-scenario` evidence (full original envelope retained in the parent Session) captures the real extracted frontend in cloud Chromium with synthetic data. All seven steps completed and retained the header menu screenshot/DOM. The [scenario input](before/reference.input.json) and [published reference screenshot](https://api.reasonmachines.com/media/pr-screenshots/d870afed-fe7e-4bd0-92ce-54d0680685ee/61b919ea4de12efa6a6b4ff2750bd092/ref-dark.png) are retained here. PNGs and the original REA envelope are not copied into this publication checkout; the source envelope remains in the parent Session. No new REA error occurred. Extracted-frontend execution is not native macOS proof.

## Reproduction and change

The [browser driver](../../tools/side-by-side/header-repo-menu.check.mjs) opens the same local workspace in each app and theme. Before, the reference menu opened and its Repository settings item navigated to Misc in both themes. OpenConductor had no repository button in either theme. The driver failed with `oc/dark: repository breadcrumb opens a menu`, actual false, expected true. [Before observations](before/results.json) retain both failures.

`RepoHeaderMenu` uses the existing Base UI menu and existing popup/item styles, `RepoIcon`, settings navigation event and `openUrl` bridge. Its only production caller change is the breadcrumb in `WorkspaceView`. The `Repo` type remains the authoritative input. A callback threaded through App was rejected because the existing `openRepoSettingsPage` event already owns this exact navigation. Model the Domain and Type System Discipline kept menu state in Base UI and remote parsing at one typed boundary rather than adding flags to WorkspaceView.

After, all four dark/light reference/OpenConductor contexts pass. [After observations](after/results.json) prove keyboard Enter opens the menu, Escape closes it, both labels match, and Repository settings opens Misc. In OpenConductor, clicking Open on GitHub sends exactly `https://github.com/tide-labs/tide-web` to a captured browser/opener boundary; no external browser is launched. Focus after Escape differs in this synthetic setup: the reference does not return it to the trigger, while OpenConductor does. Focus parity is not claimed. An early test incorrectly required reference focus restoration; the final driver records that field without normalizing it.

`repositoryGitHubUrl` converts HTTPS, SCP-style SSH and ssh:// GitHub remotes to a canonical HTTPS repository URL. It does not forward credentials, query strings or fragments. Local paths, malformed remotes and other hosts do not expose the GitHub item.

## Parent checks

The checks below ran on the parent source increment, not this publication head. The 1,339-unit result is a parent-only baseline.

- `npm run build` passed, including branding and TypeScript. Existing Vite chunk-size warning remains. An initial import of an unavailable icon package failed TypeScript; it was replaced with the repository's existing icon module.
- `node --experimental-strip-types --test src/workspace/repositoryGitHubUrl.test.ts` passed 2/2 tests, covering five canonical remotes and nine absent/invalid/non-GitHub cases.
- `node --experimental-strip-types --test --test-concurrency=2 'src/**/*.test.ts'` passed 1,339/1,339.
- `npm run lint:colors` passed.
- `git diff --check` passed.
- Final browser command through `preview_start`, `SHELL_OUT=evidence/header-repo-menu/after node tools/side-by-side/main-shell.mjs --header-repo-check`, passed all four contexts. [Preview output and release receipts](preview-receipts.json) retain the terminal verdict. All owned servers stopped and the slot was explicitly released to the menu owner.

Run the comparison through `preview_start` on port 4682 with `SHELL_OUT=<output> node tools/side-by-side/main-shell.mjs --header-repo-check`. Add `HEADER_REA=1` for a fresh extracted-reference capture. The server and driver must share the supported preview execution context.

## Publication-head checks

On the fresh main-based publication checkout, focused URL tests passed 2/2, `npm run build` passed (branding, TypeScript and Vite), `npm run lint:colors` passed, both browser drivers passed `node --check`, and `git diff --check` passed. The main-shell flag insertion was adapted because the unrelated Home-routing flag is absent on this base. No Home-routing or E2E follow-up commit was imported. New production files and the WorkspaceView replacement match the transferred Git blob identities. Full unit suite and browser comparison were not rerun here; the preview slot belongs to another owner. Original patch checksum/provenance was not re-established through retained-message transfer because evidence hashes were redacted. Published screenshots in `media.json` were viewed and uploaded by the parent.

Main advanced while this PR opened, producing an adjacent-flag conflict in `main-shell.mjs`. The publication branch merged current main and preserved both its Home-routing flags and this header flag. No parent feature commit was cherry-picked. The merged-main checkout passed the focused 2/2 tests, production build (including branding and TypeScript), driver syntax and staged diff checks again. Earlier lint results predate that base merge.

## Limits

Native Conductor/OpenConductor, WebKit, real DB persistence and real external-browser launching were not run. No Mac input, launch, build, app replacement, process stop or data change occurred. Whole-header layout remains different outside this focused menu, including workspace/branch presentation and target-branch placement. No pixel-parity claim is made.
