# Side-by-side images

Each image puts the real Conductor app on the left and OpenConductor on the right, showing the same
state at the same window size. They are the evidence behind the statuses in
[parity/ui-program/ledger.md](../ui-program/ledger.md).

## File naming

`<node>-<nn>-<state>.png`, all lowercase kebab-case, in this directory.

- `<node>`: the node slug from the ledger: `home`, `sidebar`, `header`, `chat`, `right-panel`,
  `strip`, `settings-personal`, `settings-agents-env`, `settings-repos`, `settings-more`,
  `settings-org`, `dialogs-menus`, `toasts`.
- `<nn>`: two-digit sequence within the node (`01`, `02`, ...). Take the next free number; never
  reuse or renumber an existing image.
- `<state>`: what is on screen, short, for example `empty`, `populated`, `hover-row`,
  `open-in-menu`, `run-empty`, `general`. Dark theme is the default; add `-light` at the end for a
  light-theme shot.

Examples: `home-01-empty.png`, `right-panel-03-changes-badge.png`, `strip-02-run-empty-light.png`,
`settings-personal-01-general.png`.

A new image for the same state after a fix gets a new number, so older PRs keep pointing at the
image they were reviewed with.

## Window size

Both apps are captured at the same window size: **1440 x 900 points**, the size the existing
Conductor references use ([evidence/screens/README.md](../../evidence/screens/README.md)).

- Set the window size, not the screen region: resize both windows to 1440 x 900 before capturing
  and capture the whole window, title bar included, no desktop around it.
- Same scale on both sides. A Retina capture (2880 x 1800) of one app is paired only with a
  Retina capture of the other; never mix 1x and 2x, and never stretch one half to fit.
- Same theme, same sidebar and right-panel open or closed state, same data as far as possible
  (repos tide-web, tide-api, dotfiles; workspaces named after cities), so differences come from
  the UI, not the content.

## Composition

- Left half: Conductor, captured from the native macOS app (`/Applications/Conductor.app` on
  Sven's Mac), committed under `evidence/screens/native/`. Right half: OpenConductor's built app
  in the same state.
- Both halves at full size, top-aligned, with a thin neutral gutter between them and a small label
  above each ("Conductor 0.87.6" and "OpenConductor `<short sha>`").
- If no native capture exists for the state, say so in the PR. A Chromium harness render from
  [evidence/screens](../../evidence/screens) may stand in only when labelled
  "Conductor (harness render)", and it does not count as `matches` in the ledger.

## In the PR

- Every PR that changes a node commits its side-by-side image here and shows it in the PR body:
  look at the image first, publish it with `tools.media_publish_file`, and paste the returned
  Markdown into the body, plus a link to the committed file.
- Update the node's row in the ledger in the same PR: PR number, status, and Last verified as
  `<date> <short sha>` linked to the image.
- Claims about how Conductor looks or behaves come from the native reference or from REA on the
  real app, never from memory or guesses.
