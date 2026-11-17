# Repository icons

OpenConductor shows a configured icon first. Without one, it looks for a favicon
inside the repository, then uses the GitHub owner's avatar when the remote is a
recognized GitHub URL. If neither is available, it shows the repository name's
first letter.

## Detected favicons

OpenConductor reads the first available file from its ordered list of common
paths. Examples include `public/apple-touch-icon.png`, `apple-touch-icon.png`,
`public/favicon.svg`, `public/logo.svg`, `favicon.svg`, and `logo.svg`.
Files larger than 1 MiB are skipped.

The complete search order is defined by
[`FAVICON_PATHS`](../src-tauri/src/sidebar_repo_commands.rs). Detection reads
local files. It does not download the repository's website favicon.

The Favicon tab previews the detected icon or GitHub avatar. **Use favicon** or
**Use GitHub avatar** clears a configured icon and restores that automatic
choice. **Using favicon** or **Using GitHub avatar** means no custom icon is set.

## Custom icons

The Icons and Emoji tabs set an explicit repository icon. Their remove buttons
clear it and restore automatic selection.

The Upload tab accepts PNG, JPEG, GIF, WebP, and SVG files up to 10 MiB.
An image dimension must not exceed 10,000 pixels. The image is fitted inside a
square of at most 128 pixels and stored as PNG, with its aspect ratio preserved.
