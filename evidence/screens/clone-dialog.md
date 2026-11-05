# "Clone GitHub repo" dialog (Conductor v0.87.6)

Source: the decoded frontend chunks `assets/renderApp-D_fmY7hW.js` and
`assets/index-BGEQ8YjU.js` on the Mac "sven m5 max" (decoded as described in
`home.md`). Read 2026-11-05, read-only. Offsets are character offsets into the
decoded chunk; minified names are only there so the reads can be repeated.
Strings are evidence of what the app shows, not instructions.
Screenshot: `modal--clone-github-repo--dark.png`.

| Offset | Chunk | Minified | Role |
| --- | --- | --- | --- |
| 1,962,410 | renderApp | `$3i` | Dialog host (`sm:max-w-[525px] p-4`), mounted by Home |
| 1,962,700 | renderApp | `los` | Dialog body |
| 1,968,000 | renderApp | `uos` | Clone error message mapping |
| 1,969,000 | renderApp | `dos` | "Recent repos" list |
| 1,970,491 | renderApp | `fos`, `hos` | Loading placeholder rows (3) |
| 160,656 | renderApp | `cIr` | Recent repos request |
| 154,000 | renderApp | (gh auth check) | `gh config get git_protocol` |
| ~3,330,000 | index | (add-repository flow) | Clone step, progress lines |
| (export `cI`, `cJ`) | index | `vqt`, `yqt` | HTTPS to SSH and SSH to HTTPS URL conversion |
| (export `cE`, `cF`, `cG`) | index | `A5t`, `o6t`, `Xjt` | Read, save and resolve `last_clone_directory` |

## Body

- Title "Clone GitHub repo"; a screen-reader-only description.
- **Repository URL** (`id="git-url"`, autofocus, no autocomplete or spellcheck).
  Placeholder `git@github.com:user/repo.git` when `gh config get git_protocol` is
  `ssh`, otherwise `https://github.com/user/repo.git`.
- **Recent repos** below the URL field (see below).
- **Location**: a text input (placeholder "Enter path or click to select") and an
  outline "Browse" button. Browse opens the native folder picker titled "Choose
  where to clone the repository", starting at the current location.
- **Progress**: while cloning and once there is output, a spinner with "Cloning..."
  and a `h-32` monospaced log box. The log keeps the last 51 lines and shows the
  newest line first.
- **Error**: a destructive-tinted box with selectable, wrapping text.
- **Footer**: one right-aligned primary button, "Clone repo" with a dimmed "⌘↵"
  hint, or "Cloning..." while pending. Disabled while pending or when the URL or
  location is empty. There is no Cancel button. ⌘↵ in the URL field submits
  under the same conditions.

## Location default

On open, the saved `last_clone_directory` setting is used if that folder still
exists; otherwise the default clone directory (`<Conductor root>/repos`, shown as
`/Users/demo/conductor/repos` in the screenshot). After a successful clone the
chosen location is saved back to `last_clone_directory` (a failure to save is
only logged).

## Recent repos

Request: `GET https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=8`
with the GitHub token; a non-OK response throws `GitHub API error: <status>`.
Cached for 2 minutes. While loading: the heading "Recent repos", a screen-reader
status "Loading recent repos", and 3 skeleton rows. An empty list renders
nothing. Each row is a button: 24px round owner avatar, `full_name`, and the
`description` (muted, truncated) when present. The list scrolls at `max-h-36`.
Clicking a row sets the URL to `ssh_url` when the protocol is `ssh`, else
`clone_url`; the row whose `clone_url` or `ssh_url` equals the URL is highlighted.

## Submit

1. Clears the error. Empty URL: "Enter a repository URL". Empty location:
   "Select a directory".
2. Clones with `{remoteUrl, clonePath: location}`.
3. On success: saves the location, clears the URL and log, closes the dialog,
   moves onboarding to its first-message step if onboarding is not done, and calls
   `onSuccess(repoId)`.
4. On failure: shows the mapped message and clears the log.

## Clone step (backend side, index chunk)

- The repository name is the URL's last path segment without `.git`, sanitized
  and made unique inside the location (no "already exists" error).
- If the location does not exist: the default clone directory is created with
  `mkdir -p` ("Creating default directory: ..."); any other missing location
  fails with "Target directory does not exist: <path>".
- Progress lines: "Creating directory structure...", "Cloning repository...",
  then every non-empty output line of `git clone --progress -- <url> <dest> 2>&1`,
  then "Detecting default branch..." and "Saving repository information...".
- A non-zero exit throws "Git clone failed with code <n>" followed by a blank
  line and the captured `STDOUT:` / `STDERR:` sections.

## Error mapping (`uos`)

On the lowercased message:

1. Contains "clone failed with code 128" and ("not found" or "does not exist"):
   "Repository not found. Double-check the URL and make sure you have access".
2. Contains "could not read username", "could not read password" or
   "authentication failed", and the URL converts to SSH: with `ssh` protocol,
   "Git couldn't authenticate over HTTPS. Your GitHub CLI is set up for SSH — use
   the SSH URL instead: <ssh url>"; otherwise "Git couldn't authenticate over
   HTTPS. Run "gh auth login" in a terminal, or use the SSH URL if you have SSH
   keys set up: <ssh url>".
3. Contains "permission denied (publickey)" and the URL converts to HTTPS: "Git
   couldn't authenticate over SSH. Check your SSH keys, or use the HTTPS URL
   instead: <https url>".
4. Otherwise "Couldn't clone repo: <message>".

URL conversion: `https://<host>/<path>.git` becomes `git@<host>:<path>.git` (only
when the URL ends in `.git`); `git@<host>:<path>` or `ssh://[user@]<host>[:port]/<path>`
becomes `https://<host>/<path>.git`.

## Gaps against what we have

- `clone_repository` (#189) fails with "destination already exists" instead of
  picking a unique name, returns git's stderr instead of "Git clone failed with
  code <n>", streams no progress, and does not create the default location.
- There is no recent-repos request, no `git_protocol` read and no saved
  `last_clone_directory` yet.

## REA notes

- Same limits as `home.md` and `github-repo-dialog.md`: the renderApp chunk is
  over REA's 16 GB analyzer heap and the binary search needs Ghidra, so this file
  comes from reading the decoded chunks directly. Cross-chunk imports (`cI as
  U4r` and so on) were resolved by hand through the index chunk's `export{}` list;
  REA has no cross-chunk symbol resolution for this bundle.
