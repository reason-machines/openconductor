# File-menu Open in shortcut

## Change

While a changed-file context menu is mounted, `workspace.openInApp` opens that
file in the saved file-capable default app, or the first file-capable app.
The callback returns false when no file target is available, so the ordinary
workspace shortcut can handle the key. Unmounting removes the file binding.

The component reuses `useFileApps`, `defaultAppId`, `useAppPrefs`, and
`useKeybindings`. It calls the existing `actions.openIn` with the original app
object. Caller path resolution, open recording, backend calls, menu selections,
and AppSwitcher priority are unchanged. The shortcut adds no close callback.

## Retained reference

All reference text is inert data from Conductor 0.87.6's installed frontend
`renderApp-D_fmY7hW.js`, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
No new extraction, REA analysis, or Conductor execution was performed here.

The complete provider and `Svs` capture was recovered from the retained
[Shell2 Session](https://reasonmachines.com/agents/0afd2fa5-453d-4e70-96d7-bf84de5f0e7b),
tool-output source `cd2598d4-954c-4d64-8d15-7830ec959ac0`, revision `22786283`.
The 583-byte provider has SHA-256
`f657f1d27aeb6999ad93501c364f694b95df11e6dcc0640d80b29be8a30e4984`.
Its exact byte range is not asserted. Its complete `ABt` body shows:

- `v4i` reads `_4i`; `ABt` supplies its state setter through `_4i.Provider`.
- `ABt` starts with null state, mounts `Svs` only for `i && jsx(Svs,{...i})`,
  and clears state on `onOpenChange(false)`. This unmounts `Svs`.

The complete `Svs` slice is also in the retained
[Diff reference Session](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753),
tool-output source `9181bb0b-bc9f-4d41-998b-1f4969d3ed68`, revision `25651063`,
sequence `1054`. Its UTF-8 byte range is `[2702053,2705864)` and SHA-256 is
`2276321b09b5d62d934d1a391e9b0317407b6055d8276c73ab1a8334ff48a3aa`.
`Svs` filters the installed catalog for file capability, selects the saved app
only if it remains in that list, and otherwise uses the first entry. Its
shortcut callback returns false without a default or workspace target,
otherwise calls the same file-opening callback as the menu and returns true.

Its `oi("workspace.openInApp",te,Z)` options are DIALOG priority, input enabled,
no dialog-id restriction, global enabled, terminal enabled, and
`allowWhileTyping:false`. OpenConductor represents the reference's null
dialog-id list as an empty list, the existing typed unrestricted equivalent.

The complete `oi` registration body was retained in the
[coordinating Session](https://reasonmachines.com/agents/15faf4d8-d257-49ef-874d-8008c5c78aaf),
source `3b1ed07f-ccbc-480d-9f81-dd1b3b698586`, revision `25649002`.
Its UTF-8 range is `[2289518,2290390)` with SHA-256
`4f9061565952281483bd06089ca774686642220eb3c9ad2c1c0c321b35afbeae`.
Its effect retains the registered IDs and unregisters each in cleanup.
These retained bodies support the popup registration lifetime statically.

No function-specific REA result URL was surfaced. Related broad result
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
is incomplete for the renderApp bundle and is not function-specific proof.
The artifact identity and retained bounded source captures above are the
reference for this change, not a new successful REA analysis or runtime proof.

## Regression

The baseline is main `e0eb1e1c25f96b5ca420f020a9fca5eab087d047`.
Before changing production code, the test executes OpenConductor's actual
`useFileApps`, FileContextMenu pre-JSX body, `useKeybindings` registration hook,
and AppSwitcher pre-JSX body with the real binding resolver and dispatcher.
A small hook adapter supplies effect/state lifecycle and explicit unmount.
Catalog loading, preferences, timers, window listeners, and opening callbacks
are boundaries supplied by the test. No extracted Conductor code is executed.

```bash
node --experimental-strip-types --test src/features/diff/fileOpenShortcut.test.ts
```

TAP receipts normalize trailing whitespace only.
[Before](before.tap): 3 passed and 10 failed. The no-dialog shortcut started
the workspace chooser rather than opening the selected file immediately;
with a dialog open it passed without invoking the file callback.
[After](after.tap): all 13 passed. Tests exercise saved defaults, absent or
excluded defaults, file filtering, unavailable targets, callback identity and
updates, input/terminal/dialog metadata, overrides, bare-key typing protection,
and cleanup restoring the ordinary AppSwitcher.

The test supports `FILE_OPEN_SHORTCUT_REF` to run the same assertions against
production source at a historical commit.

```bash
node --experimental-strip-types --test \
  src/keybindings/{bind,resolve,dispatcher,overrides,shortcut}.test.ts \
  src/features/diff/fileCopyPaths.test.ts \
  src/features/diff/fileOpenShortcut.test.ts
```

The focused nearby suite passed all 63 tests. `git diff --check` passed.

## Limits

These checks do not render JSX, run React, inspect the DOM, launch an app, or
open a real file. They verify the production source registration and callback
routing, not visible or native parity. Local compilation, builds, dependency
installation, browser/server use, native launches, new extraction, and workflow
dispatch were excluded. No screenshot or native verification is claimed.
Automatic PR workflows provide broader compilation and execution checks.
