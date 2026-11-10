# Settings config menu: Copy path

Conductor Rebuild compared the live Settings menu with retained Conductor 0.87.6 REA source. No new extraction, app execution or native observation was performed.

## Reference and reachable mismatch

The shipped `renderApp-D_fmY7hW.js` function `Nzi` renders config-file cards with `P9`, type `file-secondary`, `pathToOpen` set to the config file and a separate directory fallback. Complete retained record: source `8bff8dcc-f794-4ef3-a822-dad0550172df`, revision `21992894`, [source Session](https://reasonmachines.com/agents/93463893-7fd2-42ee-a0c7-7523360e6589).

Complete `P9` builds its default copy descriptor as `{value:n,itemLabel:"Copy path",toastLabel:gvs(o)}` and passes it to `cFn`. Here `n` is `pathToOpen`, not the directory fallback. Retained source `f559bae2-3c4f-4730-97ff-21dca43e654b`, revision `22690711`.

Complete `cFn` always returns the application content followed by the copy item. Its application content may be pending, empty, or a list. The copy item calls `n5(o.value,o.toastLabel)`. Retained source `34af39a2-1223-4a8f-8f02-c178ee5ae13e`, revision `21994197`, [source Session](https://reasonmachines.com/agents/4ae8c68c-1d15-4783-9eb0-5997f8ea989f).

Retained `n5` skips an empty value, awaits the clipboard write, reports `Copied ${label} to clipboard` on success and `Failed to copy to clipboard` on rejection. Source `d2eb64bf-b54b-4ae0-87d0-16d5fd428520`, revision `21994940`.

The live OpenConductor route is `AgentsPage` → `ClaudeTab`/`CodexTab` → `agents/kit.ConfigFileCard` → `OpenInSplit`. Before this correction that menu rendered only application items and disabled its chevron when the application list was empty. It could not copy the config path. The separate plain-button card in `rows/AgentOptionRows` belongs to unused option exports and is not evidence of a missing live app chooser. That earlier candidate was retracted without a production edit.

## Correction

The existing Settings menu now includes Copy path, including when a known path has no installed applications. It copies the original path through the clipboard, closes the menu, and uses the existing toast components for success or failure. The file-opening fallback and app/default recording are unchanged. Reason's directory card supplies a directory label rather than calling its config directory a file.

## Checks and limits

- Before the correction, `node --test src/settings/agents/kitModel.test.ts` passed the three existing rules and failed both new source invariants: the menu had no Copy path item, and its chevron required installed applications.
- After the correction, those source invariants pass. Pure clipboard tests exercise the exact full path with spaces and Unicode, completion ordering, directory feedback, rejection and missing/empty paths.
- These tests do not render React or exercise the operating-system clipboard. No local dependency installation, build, typecheck, app/browser/native execution or workflow dispatch ran. Automatic CI supplies compile-dependent checks. Native menu rendering, click/keyboard behavior, clipboard integration and toast placement remain unverified with the sole native owner.
- The imported `eii` helper's exact retained export dependency (`index-BGEQ8YjU.js`, export `eM`) was unavailable in the retained artifact tree. Its effects were not inferred, and this change does not modify opening or preference behavior.
