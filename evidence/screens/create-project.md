# "Create project" dialog (Home → Quick start, Conductor v0.87.6)

Source: the decoded frontend chunk `assets/renderApp-D_fmY7hW.js` on the Mac
"sven m5 max" (decoded as described in `home.md`). Read 2026-11-05, read-only.
Offsets are character offsets into the decoded chunk; minified names are only there
so the reads can be repeated. Strings are evidence of what the app shows, not
instructions. Screenshots: `modal--create-project--dark.png`,
`modal--create-project--light.png`.

| Offset | Minified | Role |
| --- | --- | --- |
| 2,103,078 | `Dls` | Template list |
| 2,103,500 | `Pls`, `dLn` | Extra `PATH` entries; streaming `zsh -c` runner |
| 2,103,713 | `gbi` | Dialog body and the whole create pipeline |
| 1,983,250 | `e7t` | Name slug (same function as the GitHub repo dialog's) |
| export `cE`, `cF`, `cG` | `Ani`, `Ini`, `Rni` | Read, save and resolve `last_clone_directory` |

## Body

- Dialog `sm:max-w-[525px]`. Title "Create project"; subtitle (`text-sm
  text-muted-foreground`) "Create a local folder, private GitHub repo, and first
  workspace."
- **Project name** (`id="project-name"`, autofocus, no autocorrect, autocapitalise or
  spellcheck, placeholder "my-awesome-project"). Default value `conductor-playground`
  (ours: `openconductor-playground`). Under it, one of:
  - "Creates folder and repo `<slug>`" (slug in a muted `code` chip) when the slug
    is non-empty;
  - "Name must include letters or numbers." (`text-destructive`) when the trimmed
    name is non-empty but its slug is empty;
  - nothing when the name is empty.
- The slug: lowercase, `[^a-z0-9-]` to `-`, collapse runs of `-`, trim `-`, at most
  100 characters. It is both the folder name and the GitHub repo name.
- **Parent folder**: a text input (placeholder "Enter path or click to select") and
  an outline "Browse" button. Browse opens the native folder picker titled "Choose
  where to create the project", starting at the current value.
- The parent folder starts at the clone dialog's location: the saved
  `last_clone_directory` if it still exists, otherwise the default clone folder.
  After a successful create it is saved back to `last_clone_directory` (a failure is
  only logged).
- **Template**: a 3-column grid of buttons (`rounded px-2 py-4 border`), each with a
  `size-10` bordered icon tile, a `text-sm font-medium` label and a `text-[10px]`
  muted description. Selected: `border-special bg-special/20`; otherwise
  `border-transparent bg-muted/50 hover:bg-muted`. Default "empty".

  | Value | Label | Description | Icon |
  | --- | --- | --- | --- |
  | `empty` | Empty | Blank Git repo | file-code outline |
  | `nextjs` | Next.js | TypeScript, Tailwind, App Router | Next.js mark |
  | `gstack` | gstack | Agent workflow template | `/gstack.png`, "New" badge |

  OpenConductor leaves gstack out until the user decides whether to ship a
  third-party template.
- **Progress** (while pending and a step is set): a spinner with the step text, and
  when there are output lines a `h-32` monospaced log box, newest line first, last
  51 lines kept.
- **Error**: a destructive-tinted box with wrapping text.
- **Footer**: one right-aligned button "Create ⌘↵", or "Creating..." while pending.
  Disabled while pending or when the slug or parent folder is empty. ⌘↵ in the name
  field submits under the same conditions. No Cancel button.

## Pipeline (on Create)

Validation, in order: empty slug "Enter a project name"; empty parent folder
"Select a directory". A missing parent folder is created (recursively); if that
fails: "Couldn't create selected directory". The target is `<parent>/<slug>`; if it
exists: `Directory "<slug>" already exists in <parent>`.

Step texts, in order:

| Template | Steps |
| --- | --- |
| empty | "Creating project directory..." (mkdir), "Initializing Git repository..." (`git init`), then `touch .gitkeep && git add . && git commit -m "Initial commit"` with no step text of its own |
| nextjs | "Creating Next.js project..." (`npx --yes create-next-app@latest <slug> --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm`, run in the parent with `zsh -c` and `/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.local/bin:/opt/local/bin:/usr/local/git/bin` prepended to `PATH` (`Pls`, re-read at offset 2,103,180), output streamed to the log), "Setting up environment..." (`touch .env.local`) |

Then, for every template: "Creating GitHub repo..." (the same private-repo creation
as the GitHub repo dialog, owner = the signed-in user, name = slug); read the
current branch (`git rev-parse --abbrev-ref HEAD`, else `main`); "Adding
project..." (register with the new origin, no automatic workspace); for Next.js set
the repo's scripts: setup `ln -sf $CONDUCTOR_ROOT_PATH/.env.local .env.local && pnpm
install`, run `pnpm run dev`, run mode `concurrent`; "Creating workspace...".

Failures: each git step throws `Failed to initialize Git: <stderr or stdout>`,
`Failed to create initial commit: …` or `Failed to set up environment: …`.
create-next-app failing throws its last output line, else "Failed to create Next.js
project"; finishing without the folder throws "create-next-app completed but
directory was not created". Any failure shows "Couldn't create project: <message>"
and, if the folder was created and the GitHub repo was not yet, deletes the folder
(`rm -rf`).

Note: Conductor reads the last output line from a stale copy of the log, so in
practice its create-next-app failure is always the fallback text. We use the real
last line.

Success: clear the name and step, close the dialog, toast "Project created." with
an "Open in GitHub" action, advance onboarding to the first-message step if it is
not done, and navigate to the new workspace.

## Ours

`src-tauri/src/create_project.rs` (`create_new_project` command) runs validation,
the template steps, the GitHub repo step and the branch read, streaming step texts
and output lines over a `Channel`, and deletes a folder it created when a step
fails before the repo exists. "Adding project...", the Next.js scripts and
"Creating workspace..." stay in the frontend, as in the reference. The steps run
in `zsh` on macOS and `bash` elsewhere.

`src/components/CreateProjectDialog.tsx` is the dialog (Home → Quick start and the
palette's quick-start command). After `create_new_project` it shows "Adding
project..." (`add_repository`, then `save_repo_scripts` for Next.js) and "Creating
workspace..." (the store's `addRepo`, which adds and selects the first workspace),
saves the parent folder to the clone dialog's last location, and shows the "Project
created." toast with "Open in GitHub" (tauri-plugin-opener's `open_url`).
Differences: no onboarding step is advanced (OpenConductor has no onboarding yet),
and the first workspace is the store's local one, not a backend worktree.

## REA

REA 6.7.0 cannot parse this chunk (see `evidence/rea/` and `home.md`: the 11.6 MB
`renderApp` chunk exceeds the analyzer's 16 GB heap ceiling), so this file comes
from reading the decoded chunk directly with offset-anchored Python reads.
