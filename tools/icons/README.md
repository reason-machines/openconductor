# Shared icon set

`src/components/Icons.tsx` draws every shared icon through `ConductorIcon`, from `src/components/conductorIcons.generated.ts`.

- Source: Lucide 0.577.0 (ISC), the release that matches Conductor's chat icons. 36 of the 37 chat icons Conductor draws are byte-identical to it; `clock` differs and is not in the set.
- Names: `shared-icon-names.txt`. Regenerate with `npm pack lucide-static@0.577.0`, untar, then `node tools/icons/gen_shared_icons.mjs ./package`.
- Stroke: 2 at 24x24, as Conductor draws them (was 1.8 hand-drawn).
- Side-by-side: `node tools/icons/side_by_side.mjs` writes `parity/side-by-side/icons/`. On a Session whose state path is long, run it with `TMPDIR=/tmp`, since Chromium's socket path must be short.
