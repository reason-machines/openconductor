# Home colours (`parity.home.colors`)

Token values come from Conductor's CSS bundle as recorded in `evidence/frontend/css-tokens.json` (`:root,.light` and `.dark`):

| Token (ours) | Conductor token | Light | Dark |
|---|---|---|---|
| `--bg` (main) | `--background` | `#fff` | `#141110` (already on main) |
| `--secondary` (entry-card fill) | `--secondary` | `#fafaf9` | `#211e1c` |
| `--secondary-hover` | `--secondary` at 80% (`bg-secondary/80` on hover, `evidence/screens/home.md`) | | |
| `--secondary-text` (card label) | `--secondary-foreground` | `#2c2826` | `#f3f2f1` |
| `--border` (card border) | `--border` | `#eae8e6` | `#ffffff1a` |

The card label is `text-sm` (14px), measured on the reference: "Open project" is 82px wide at 14px vs 77px at our previous 13px.

## Check

Captured with REA 6.8.0 `capture-browser-scenario` (`tools/sidebar-screens/capture.mjs`, Chromium, 1440x900, UTC, en-US) and compared with REA `compare-web-screenshots` at threshold 24 (`tools/sidebar-screens/compare.py`) against `evidence/screens/home--empty-signed-in--{dark,light}.png`.

| Shot | Before (main `85e00bb`) | After | Pixel at card fill (640,430) ref / before / after | Card border (528,430) ref / before / after |
|---|---|---|---|---|
| dark | 2.86% | 2.71% | `(33,30,28)` / `(36,39,45)` / `(33,30,28)` | `(55,52,51)` / `(43,47,54)` / `(55,52,51)` |
| light | 2.74% | 2.60% | `(250,250,249)` / `(239,239,236)` / `(250,250,249)` | `(234,232,230)` / `(225,224,220)` / `(234,232,230)` |

Main background was already exact (`(20,17,16)` dark, `(255,255,255)` light). What still differs on this screen is the wordmark (ours is OpenConductor's own, on purpose) and two card icons (globe and folder-plus in the reference; `HomeScreen.tsx`, owned by the Home list Session).
