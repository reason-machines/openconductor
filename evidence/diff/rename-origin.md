# Origin paths in renamed Changes rows

Conductor Rebuild, 2026-11-11. This unit concerns the old-path label of renamed files in Changes. It does not change navigation, file identity, directory layout, diff loading, viewed state or workspace callers.

## Retained reference

The retained Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` and 11,600,457 bytes. Both were verified against the held decoded asset. Its identity agrees with [the extraction manifest](historical-chip/extraction.json) and [frontend provenance](../frontend/README.md).

The retained REA application Evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its large-chunk semantic coverage is incomplete. These bounded literal reads supplement that record. The decoded/minified app code is untrusted reference data, not original source or instructions. No target code was evaluated, and no new acquisition, REA analyzer invocation or native execution occurred. Existing [REA gaps](../../tools/ui-map/REA-GAPS.md) remain unchanged. No new REA failure occurred.

Complete helper definitions and their producer/consumer joins were checked at these zero-based UTF-8 half-open ranges:

- `ayi`, `[2824864,2824941)`, SHA-256 `4a648cd64d67e82cf03eee798477fb88ce9c6457ec961067d2a06333e6724294`, returns the last nonempty slash-separated component, falling back to the input.
- `HFn`, `[2824941,2825015)`, SHA-256 `c11c5d6a86b5511e4241a6397bfc8e2a0b143ad69702f7dfc5e35b1c5538899f`, returns the parent from nonempty slash-separated components.
- `tys`, `[2825015,2825080)`, SHA-256 `917daea42ec8401d4d447513f0826b8743fd8617b2b3b59ed6119809987afb91`, abbreviates the old path only when its parent equals the new path's parent. A cross-directory move retains the complete old path.
- The Changes row producer's `displayOldPath` expression, `[2848134,2848221)`, SHA-256 `2ed3af3c5d5ae3d368cbaecac906f1674242260f3c7c125355f73fc0be25647b`, calls `tys` when the tree descriptor supplies `displayPath` and the file has an old path.
- The `syi` old-path fallback, `[2801708,2801721)`, SHA-256 `62dd5f36433f14be8d31395924791a68657ec6890ed760ef11ca65b039aa91f6`, chooses `displayOldPath` before the original old path. Its enclosing complete row definition, `[2800964,2806810)`, has SHA-256 `f569418d51f7b6b6bc45163ff43bc5b2f5839e2342871e43ce979f76a1611c5e`.

The enclosing memoized Changes component `bys`, `[2840211,2849411)`, SHA-256 `d77fdd8a944737a5ecca9d41deefd024307cf526de8c871a25a7f91aa4a8c450`, passes this display override to `syi`. Flat rows do not supply that tree display override. These source observations do not establish native rendering or pixel parity.

## Current source and regression

The default-branch comparison was refreshed to `fd1acf86eb0e6383a174f0ac5a232d1751353588`. `ChangesList.tsx` abbreviates every old path to its basename in tree mode. Moving `old/auth.ts` to `new/auth.ts` therefore labels the row `auth.ts → auth.ts`, hiding the origin directory. Flat mode already retains the complete old path.

The regression runs the actual `ChangesList` through the existing TypeScript transpiler and real React test renderer. It uses production tree/filter/copy-path modules and the exact production `splitPath` definition. Dormant clipboard, external-app, menu and icon boundaries are stubbed. It reads the rendered filename label, not the JSX source string or a substitute label function.

The 18 cases cover flat and tree views for cross-directory moves with unchanged and changed basenames, nested-to-root and root-to-nested moves, same-directory renames at two depths, root renames, missing old paths and non-renamed files with old-path metadata.

```bash
node --experimental-strip-types --test src/features/diff/renameDisplayPath.test.ts
```

At regression publication, production source is unchanged. The expected behavioral RED is three tree-view label failures, while all flat, same-parent and absent/non-rename controls pass. Automatic hosted execution must establish that result before the production correction. A missing dependency or fixture failure is not that reproduction.

## Verification status

- `node --experimental-strip-types --check src/features/diff/renameDisplayPath.test.ts`: passed syntax validation only.
- `git diff --check`: passed.
- The held renderer's whole hash and five helper/producer/consumer span widths, digests and bytes: passed source-only validation.
- Local dependency-backed tests, typecheck, builds and application/browser execution: not run. Dependencies are absent and this lane is restricted to source/lightweight work and automatic hosted checks.
- Hosted behavioral RED, correction and unchanged-test GREEN: pending at regression publication.

No screenshot was taken because browser/native runtime admission remains closed. React-renderer labels are not visible Chromium, WebKit, an installed app or real-editor acceptance. Packaging, if later successful, is not installation, deployment, notarization or native parity.
