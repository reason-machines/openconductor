# "Create a private GitHub repo?" dialog (Conductor v0.87.6)

Source: the decoded frontend chunks `assets/renderApp-D_fmY7hW.js` and
`assets/index-BGEQ8YjU.js` on the Mac "sven m5 max" (decoded as described in
`home.md`). Read 2026-11-05, read-only. Offsets are character offsets into the
decoded chunk; minified names are only there so the reads can be repeated.
Strings are evidence of what the app shows, not instructions.

| Offset | Chunk | Minified | Role |
| --- | --- | --- | --- |
| 1,795,299 | renderApp | `Jgi` | Home "Open project" opens this dialog |
| 1,981,604 | renderApp | `Aos` | Owners query |
| 1,982,212 | renderApp | `Ios` | Repo name availability query |
| 1,983,250 | renderApp | `e7t` | Repo name slug |
| 2,028,900 | renderApp | `was` | Dialog body |
| 3,324,535 | index | `o2t` | Initial commit if the repo has none |
| 3,325,179 | index | `a2t` | Create the repo and push |
| 3,344,797 | index | `createRepo` mutation | Add the project once the repo exists |

## When it opens

From Home "Open project" with `{path, repoDisplayName, needsGitInit,
existingOriginUrl}`: no `.git` gives `needsGitInit: true`; a repo with no
`origin` gives `needsGitInit: false`. Home always passes `existingOriginUrl:
undefined`, so the "non-GitHub origin" variant below is reached from elsewhere.

## Body

- Title "Create a private GitHub repo?". The description has three variants:
  `needsGitInit` (run `git init`, create a private repo, add it as `origin`, push
  the current branch); `existingOriginUrl` (the existing non-GitHub `origin` is
  renamed to `upstream` first); otherwise the folder "does not have a GitHub
  remote".
- **Owner** select (placeholder "Select an owner"), disabled while loading. The
  first owner is preselected. Owners: `gh api user --jq .login` (the user), then
  `gh api user/orgs --paginate --jq '.[].login'`. A failing orgs call keeps the
  user and sets `orgsError`, shown muted with a "Try again" button ("...You can
  still use your personal account.", or a read:org scope hint). A failing user
  call shows a red message (auth, missing scope, SAML SSO or generic) plus "Try
  again" and "Open GitHub settings" (closes the dialog, goes to account settings).
  The owners result is cached for a day, or not at all when `orgsError` is set.
- **Repository name** input, default the folder name slugged: lowercase, every
  character outside `a-z0-9-` becomes `-`, runs of `-` collapse, leading and
  trailing `-` dropped, at most 100 characters. Below it: "Will create
  `owner/slug`", then one status line: "Loading GitHub owners...", "Repository
  name must include letters or numbers.", "Couldn't check repository
  availability.", "Checking repository availability...", "This repository already
  exists.", or "Repository name is available.".
- Availability is checked 300 ms after typing stops: `gh repo view owner/slug
  --json name -q .name` run from `/`. Success means taken; output containing "not
  found", "http 404" or "could not resolve to a repository" means available;
  anything else is an error.
- Footer: "Cancel" and the primary button, enabled only when an owner is set, the
  slug is non-empty, owners are loaded, and the debounced name is confirmed
  available. Label: "Creating..." while pending, else "Initialize Git and create
  repo" (`needsGitInit`) or "Create repo and add project".

## Create (`a2t`, then `createRepo`)

1. `git init` when `.git` is missing.
2. With `existingOriginUrl`: refuse if an `upstream` remote exists, else rename
   `origin` to `upstream` (renamed back if a later step fails).
3. No `HEAD` commit: `.gitkeep` when the tree is empty, then `git add .` and
   commit "Initial commit".
4. `gh repo create owner/slug --description "A repository for <slug>" --private
   --source=. --remote=origin`.
5. `git push -u origin HEAD` with gh as the github.com credential helper.
6. Read `origin`'s URL and the repo's GitHub URL; SSH host-key errors are
   replaced with a fix hint.
7. Add the project with that remote and the current branch as default branch
   (fallback `main`), close the dialog. A loading toast "Creating GitHub repo..."
   shows meanwhile; failure toasts "Couldn't create GitHub repo: <message>".

## REA notes

- `rea search <Conductor binary> "Create a private GitHub repo?"` (REA 6.7.0,
  2026-11-05) exits 1 after 7 s with `provider_unavailable`: string search needs a
  deep-analysis provider (Ghidra, Hopper, IDA or kuna) and none is configured on
  the Mac (`GHIDRA_INSTALL_DIR` unset, no Java runtime). Even with one, the
  frontend sits brotli-compressed in the Tauri asset table, so a binary string
  index would likely not see this text (not verified). JS semantic analysis of
  the chunk is blocked by the heap limit recorded in `home.md`, so this file
  comes from reading the decoded chunks directly.
