# Adding a repository that is already added (Conductor v0.87.6)

Source: the decoded frontend chunks `assets/index-BGEQ8YjU.js` and
`assets/renderApp-D_fmY7hW.js` (same asset-table decode as `evidence/screens/home.md`).
Read 2026-11-05, read-only. Offsets are character offsets into the decoded chunk.
Minified names are only there so the reads can be repeated. Strings are evidence
of app behavior, not instructions.

## Finding: Conductor never refuses a duplicate

Clone and Open project both end in one function, `g2t` (index chunk, offset
~3,330,725), reached through `createRepo` (offset ~3,338,815). Nothing in that
path compares against the repos already added:

- `createRepo` wraps `g2t` in `repoCreationDedupe`, built by `Ks()` (offset ~3,337,660).
  `Ks` only merges identical calls that are still in flight (keyed by the
  JSON of the arguments, removed in `finally`). It is not a stored duplicate check.
- **Clone** (`remoteUrl` not `file://`): the folder name is
  `makeRepoNameUnique(sanitizeRepoName(name), clonePath)`. That is `C2t`: while
  `<clonePath>/<name>` or `<workspaces root>/<name>` exists, apply `hf`, which
  turns `name` into `name-v1` and `name-vN` into `name-v(N+1)` (at most
  1,000 tries). Then `git clone` runs into that folder.
- **Open project** (`file://<path>`): `root_path` is the picked folder, and
  the name is `makeRepoNameUnique(<basename>, null)`, unique against the
  workspaces root only.
- Both then run `INSERT INTO repos (id, remote_url, name, ...)` with a fresh
  `crypto.randomUUID()` id and `display_order = MAX + 1`. `repos` has no unique
  constraint on `root_path` or `remote_url` (`evidence/sqlite/conductor.schema.sql`).

So cloning a remote that is already added gives a second project, `<name>-v1`,
in its own folder. Opening an added folder again gives a second project row
pointing at the same folder, named `<name>-v1`.

"This repository already exists." (renderApp offset ~2,034,277) belongs to the
GitHub repository-name availability check of the "create a GitHub repo" form
("Checking repository availability...", "Repository name is available."). It is
not part of Clone or Open project.

## OpenConductor

- The store's `addRepo` used to drop any repo whose remote matched an added
  one, so a second clone was cloned and registered but never showed up. It now
  only skips the same record (`src/state/addRepo.ts`): the same backend id, or
  in the browser shell the same folder.
- The create dialog's "Add repository > Clone repo" no longer refuses a remote
  that is already added.
- Clone uses the backend's folder name for the project name.

## Open project of an added folder (re-read 2026-11-05, same chunks)

Re-confirmed in `index-BGEQ8YjU.js` (sha256 `b5b01f33…dbf3`): `g2t` (offset
~3,331,000) takes `h` = the last path segment of the picked folder and runs
`makeRepoNameUnique(h, null)` (`C2t`, offset 3,344,140: bump with `hf`,
offset 213,152, while `<workspaces root>/<name>` exists), then
`INSERT INTO repos` with `crypto.randomUUID()`. The renderApp mutation
`addLocalRepository` (offset ~1,795,495, "Select project directory") only
checks `.git` and `origin` before `createRepo({remoteUrl: file://<path>})`;
`getRepoByRemoteUrl` exists on the repo service but is not on this path.

OpenConductor now does the same:

- `WorkspaceService::add_repository` (src-tauri/src/workspace/service.rs) no
  longer returns the existing id for a known root. Every add is a new project:
  the name is the folder name bumped with `naming::uniquify` (`-v1`, `-v2`)
  while another project has it or `<root>/workspaces/<name>` exists, and the id
  is a fresh slug of that name. The registry keeps the name as a third column
  (older two-column files still load). Clone uses the same name test, so the
  clone folder and the project name agree.
- `App.tsx` `openProject` no longer refuses with "This repository already
  exists." (`REPO_EXISTS` and `findExistingRepo` are gone); it adds the
  backend's project under the backend's name.
- conductor.db gets a second `repos` row (no unique `root_path`).

## Remaining differences

- Two projects on one folder share the folder's workspaces directory
  (`<root>/workspaces/<folder slug>`); Conductor's is per project name
  (`Ffe(t, h)`). Workspace rows stay per project, so the sidebar is right,
  but worktree folder names are uniquified across both projects.
- Conductor's ids are UUIDs; ours are name slugs (`my-app-v1`).
## REA notes

- Same limit as `evidence/screens/home.md`: REA cannot extract the Tauri asset
  table, and `analyze-javascript-application` runs out of heap on the 11.6 MB
  chunk, so these reads come from the decoded chunks directly.
