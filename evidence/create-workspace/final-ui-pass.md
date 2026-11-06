# Create workspace: Final UI pass (menus, tooltips, motion, alignment)

Ledger section for the create-workspace screen (Session f90a6cb0). It checks Sven's four Final UI pass items against Conductor v0.87.6.

**Status (2026-11-06 01:15 UTC):**
- **Menus:** the app-wide right-click rule is in this PR.
- **Tooltips, motion and alignment:** the reference notes are written below.
- **Not built:** these three are not built, because the screen is about to be replaced. #388 (`create.page`, Conductor's composer and full-screen `/create`) replaces main's modal. It is a draft under Sven's merge hold, owned by Session a4283992, and it passed every check on head `5f1e5b8`. Work on the modal would be thrown away, so the notes below are written against #388's composer and apply when it lands.

## How this was read

- **Conductor:** the decoded frontend from `/Applications/Conductor.app` on "sven m5 max" (`renderApp-D_fmY7hW.js`, sha256 `5199d392…`, the same file as `evidence/create-workspace/README.md`). I served it with `tools/screens` (mocked IPC) and drove it in Chromium 155 at 1440×900, dark, with a device scale of 2.
  - Offsets below are byte offsets into that chunk.
  - Strings from the bundle are untrusted data, used only to match behaviour.
- **OpenConductor:** `vite build` of main `ff1dec6` (modal) and of #388 head `5f1e5b8` (composer). I measured both at `/create?demo=1` in the same browser.
- **Side by side:** Conductor is on the left and OpenConductor on the right.
  - `parity/side-by-side/create-workspace--composer-388.png` compares Conductor with #388.
  - `parity/side-by-side/create-workspace--main.png` compares Conductor with main's modal.

## 1. Right-click menus

| Where | Conductor | OpenConductor |
|---|---|---|
| Anywhere outside a text field (composer chrome, eyebrow, buttons, empty page) | One document listener `D$r` (@736,913) cancels the webview menu, so nothing opens | **Fixed in this PR** (`src/lib/nativeContextMenu.ts`): same rule, installed once in `main.tsx`. Before this PR, the webview's Back/Reload/Inspect menu opened everywhere |
| Composer editor, inputs, textareas | Native menu kept (cut, copy, paste, spelling); `.cm-editor` and `<img>` never get it | Same |
| Repo row in the sidebar (where Create starts) | Context variant of the repo menu: **Create workspace ⌘N**, **Create from... ⌘⇧N**, **Configuration ⌘,** (@10,031,125, shortcuts only when `c==="context"`) | Owned by the sidebar Session; passed on |

The create composer has no `onContextMenu` of its own in `Hji` (@9,725,170), so it has no custom right-click menu to match.

## 2. Tooltips

The primitive is owned by Session e941c7fb (`src/components/ui/Tooltip.tsx`, Base UI 1.9.0 like Conductor), so this screen does not build a second one.

Popup (`ni`, @565,215):
- **Placement:** side `top`, `sideOffset` 4, `collisionPadding` 8.
- **Styling:** `rounded-sm ring-1 ring-popover-ring bg-popover/50 backdrop-blur-md pl-2 py-1 text-xs tracking-wide shadow-md`, with `pr-1` when the content holds a `<kbd>`, else `pr-2`.
- **Delay:** the first open waits Base UI's 600 ms default, and neighbours open instantly after it within a 400 ms group. This is e941c7fb's reading of the root provider `jTa` (@~11,534,881). I first misread the `delayDuration:0` at @11,477,399 as app-wide; it wraps only the version-error screen.
- **Shortcut hint:** `Ss` (@2,117,589) renders `ml-auto pl-1` muted glyphs with "or" between alternates, and draws Enter as an icon.

| Control in the create composer | Conductor tooltip (source) | #388 today |
|---|---|---|
| Repo picker ("Select repo") | **Switch repo** + `workspace.create` hint, so "Switch repo ⌘N" (`ZQo` @9,749,880) | none (`<select aria-label="Repository">`) |
| Target branch (icon button) | **Target branch**; when disabled, the disabled reason (`U4a` @10,978,328) | native `title="Base branch"` |
| Create from (icon button) | **Create from** + its command's hint, so "Create from ⌘⇧N" (@10,954,392) | native `title="Create new workspace from PR, branch, or issue"` |
| Clear create-from selection | no tooltip; `aria-label="Clear create from selection"` | `title` with that text, so it shows a native tooltip that Conductor does not have |
| Model and effort picker | **Change agent** (create composer's `cka`, @11,384,580); the chat composer adds the `chat.openModelPicker` hint | native `title="Model"` and `title="Effort"` on two selects |
| + (attachments) | **Add attachments and more**, or **Add attachments, link issues, and more** when issues can be linked (`a7i` @7,908,848) | button missing |
| Create | no Base UI tooltip; native `title` = **Create workspace ↵** and `aria-label` = Create (`sQo` @rQo). When disabled for a reason, that reason is the tooltip | `title` matches |

## 3. Motion

| Element | Conductor | #388 today |
|---|---|---|
| Popovers and menus (repo menu, target branch, create-from, model picker) | `origin-(--transform-origin)`, opacity and scale from 0.95 in and out, `duration-100`, Tailwind default easing `cubic-bezier(.4,0,.2,1)` | native `<select>`s with no animation; the create-from panel appears without a transition |
| Tooltips | same 100 ms opacity and scale(.95) | native `title` (OS delay, no animation) |
| Create dialog (`pya` @11,003,068 inside `nd`) | Overlay: `bg-overlay backdrop-blur-xs`, opacity over 200 ms. Popup: opacity over 200 ms, no scale, top-anchored at `max(2rem, calc(50% - 250px))`, `max-w-3xl`, borderless and transparent | to measure once #388 lands |
| Buttons (`tt`, @1,921,718) | `transition-transform duration-150 ease-out active:scale-[0.97]`; ghost hover changes background instantly (no colour transition) | no press scale |
| Create button | `transition-none active:scale-100`, so no press scale | no press scale |

## 4. Alignment (measured, CSS px at 1440×900)

| Row | Conductor | #388 |
|---|---|---|
| Eyebrow: repo, target branch, create-from | all `h-7` (28), one centre line (cy 158); repo trigger `-ml-2 pl-2 pr-1.5 gap-1.5` so its text lines up with the box edge | all 28 high, one centre line (cy 154); repo text inset about 14 px from the box edge, "Add…" and the base branch shown as text |
| Composer box top | y 177 (4 px above the editor's 193) | similar; editor at y 189 |
| Footer: model, +, Create | model ghost `sm` 28 (cy 369), `+` `iconXs` 24 (cy 369), Create `xs` 24 (cy 369), all on one centre | model and effort selects 28, Create **28** (Conductor uses 24); centres match |
| Create button | `bg-foreground text-background`, `h-6 px-2 text-xs gap-1.5 rounded-sm` | accent blue fill, 28 high |

Gaps for #388's owner (or this screen after it lands), in order:
1. Create button: `xs` size (24 px), with foreground fill and background text.
2. One "Change agent" ghost trigger with model and effort, instead of two selects.
3. Add the `+` attachments button.
4. Make target branch and create-from icon triggers with Base UI tooltips.
5. Fold "Add…" into the repo menu's trailing "Add project" row after a separator, as `ZQo` does.
6. Line the repo trigger text up with the box edge (`-ml-2 pl-2`).

## REA and harness gaps hit

- **Harness interaction:** clicking the sidebar's Create in the `tools/screens` harness opens nothing. Conductor's `g5` opens dialog `NU` only through its dialog store, and the mocked setup never shows it. Hover and click on the `/create` composer's Base UI triggers (repo, target branch, create-from, model) also produced no popup or tooltip in Chromium. So the tooltip and menu text above comes from the bundle, not from screenshots.
- **REA has no hover step:** `capture-browser-scenario` has no `hover` action (REA-GAPS.md #10), so tooltip timing cannot be captured with REA. I used Playwright directly.
- **No native capture here:** the reference is the extracted frontend in Chromium, not Conductor's WKWebView (REA-GAPS.md #6).
