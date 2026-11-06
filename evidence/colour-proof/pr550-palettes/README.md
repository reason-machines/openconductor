# Colour proof on PR #550 head 3015979

Build: `npx vite build --outDir /tmp/oc550-dist` from a worktree of `origin/reason/task-e1faf58c` at 3015979.

- Capture: `TMPDIR=/tmp/pw DIST=/tmp/oc550-dist PALETTE_ATTR=data-color-palette SET_THEME=1 OUT=pr550-palettes node tools/colour-proof/capture.mjs`
- Grid: `python3 tools/colour-proof/grid.py evidence/colour-proof/pr550-palettes`
- `samples.json`: pixel values read back from the saved PNGs (tolerance: max-min channel spread <= 3).
- `neutral-marked.png`: Neutral light and dark with every sample point circled and labelled.
- `lint-colors.txt`: `npm run lint:colors` on the clean tree (exit 0), with a planted `#3b82f6` in src/styles.css (exit 1), and after reverting it (exit 0).

History: the first capture on 325cf0c showed the chat composer as a solid grey block (#737373 light, #a3a3a3 dark) because composer.css mapped `--oc-c-muted` to `var(--muted-foreground)`. 3015979 fixes it: the composer is now #f5f5f5 / #171717.
