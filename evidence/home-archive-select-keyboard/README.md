# Home Archive filter: Select keyboard qualification

Conductor Rebuild — `HOME-ARCHIVE-SELECT-KEYBOARD-271`.

## Baseline and reference

Fresh main `217498aae38dfd63b97919b1a0ab4097462c691e` contains pin order #1444 and the existing Projects keyboard repair. The archive filter is still the local checkbox Menu without keyboard handlers. The baseline fixture mounts the production `AllWorkspaces` and real filter/search helpers.

The historical REA extraction is Conductor 0.87.6 `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, parent evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its bytes are data only: no vendor renderer or copied function is evaluated.

[Source manifest](source.json) retains 50 exact UTF-8 spans, extents, sizes and hashes. `verify-source.py` passes **279 checks** against the full retained asset:

- Local Home `UJo` supplies its archive state/change callback to `nFi`. `nFi` constructs active/all/archived labels in that order and mounts `ah`, not the Projects `h2` menu.
- `ah → Hos` supplies the selected value, callback and option items. `Bf → qos` receives the root trigger properties and combobox/listbox semantics. `$f → tas/ias` receives root popup properties; `Il → ras/aas` registers each value/text and exposes selected options.
- `Hos → SLt` supplies the selected index. `SLt` defaults to no looping, focuses the selected item on opening, and implements arrows/Home/End. `Hos → $li` highlights typeahead while open but changes the single selected value while closed.
- `ras` commits the chosen value and closes; its installed-button chain handles native Enter/Space. `MJo` preserves the other filters when the archive value changes.

This is a retained-source contract, not a fresh observation of interaction in the original Conductor app. No new REA operation or REA gap occurred.

## Frozen mounted-DOM regression

The v2 fixture [archiveKeyboard.test.cjs](frozen/archiveKeyboard.test.cjs), SHA-256 `6ee3125f62b9f9f5e6267a7d96f1a8d36391fa4eaeabfbacef5575e767d180db`, uses ReactDOM, jsdom 26.1.0 and user-event 14.6.1 with testing-library/dom 10.4.1. Only local app code and the installed Base UI dependency may execute. Archives, preference hooks, keybinding hints and row visuals are supplied/inert adapters; filter state, storage, rendering and any Select are production code.

Baseline **14 tests: 5 pass / 9 intended assertion failures, zero skips/cancellations**. Coverage includes arrow opening on a non-first selected value; clamped endpoints; next/previous/Home/End; open versus closed typeahead; Enter/Space commit; Escape focus return; pointer selection; project-filter preservation; Projects remaining multi-select; combobox/listbox/option roles.

The first v1 run was incomplete: formatting a failed equality between different DOM objects caused the isolated Escape run to be killed. That log is not accepted as a product regression. Before any treatment, v2 changed only the failure diagnostic to compare object identity as a boolean. The complete v2 baseline and v1 bytes/logs are preserved; the source verifier enforces that one difference.

### Same-host RED → GREEN

The original jsdom 26 host cannot synthesize Base UI's virtual keyboard click because it lacks `PointerEvent`. It also batches the whole multi-key sequence inside the fixture's outer async `act`, delaying item registration and focus past the next key. Those treatment attempts are retained in [host-iterations.tar.gz](host-iterations.tar.gz), with exact hashes and counts in [host-iterations.json](host-iterations.json), as failed host runs, not clean acceptance. [dom-host.cjs](dom-host.cjs) configures only supported user-event `delay: 40` and testing-library `eventWrapper`: flush pending React work **before** each discrete event, then flush that event. ReactDOM is loaded lazily after the fixture installs its window. jsdom 27.2.0 supplies native `PointerEvent`. No app handler, test body, assertion, expectation or frozen-v2 byte is replaced.

The identical frozen test and identical final host were rerun against a source snapshot of main `217498aae38dfd63b97919b1a0ab4097462c691e` and the treatment:

- Baseline [red-v2-same-host.tap](red-v2-same-host.tap): **5 pass / 9 intended assertion failures**, no exceptions, skips or cancellations.
- Treatment [green-v2-same-host.tap](green-v2-same-host.tap): **14/14 pass**, no exceptions, skips or cancellations.

Run from the repository root with pinned throwaway DOM dependencies (no dependency-manifest edit):

```bash
npm install --prefix .ara-state/archive-dom-v27 --no-save --package-lock=false --ignore-scripts \
  jsdom@27.2.0 @testing-library/dom@10.4.1 @testing-library/user-event@14.6.1
DOM_DEPS=.ara-state/archive-dom-v27/package.json node \
  --require ./evidence/home-archive-select-keyboard/dom-host.cjs \
  --max-old-space-size=768 --test --test-concurrency=1 \
  evidence/home-archive-select-keyboard/frozen/archiveKeyboard.test.cjs
python3 evidence/home-archive-select-keyboard/verify-source.py <retained-renderer>
```

## Visible baseline and boundaries

The sole serialized cloud fixture slot was admitted by the ledger. Managed Chrome tab `1491875801` on preview server `c65b02db-8e80-4eb0-878b-8fa18d81be7b` / port 48731 reproduced actual ArrowDown delivery leaving Archive closed: [DOM receipt](browser-red.json), [screenshot](baseline-arrow-closed.png). The original historical own preview on port 4871 was explicitly stopped before this slot started.

### Treatment and visible GREEN

`AllWorkspaces` replaces only the Archive Menu call with the small `home/ArchiveFilter.tsx` leaf, following the existing SoundSelect Base UI precedent. Five Archive-only CSS rules retain the existing trigger/popup styles. The Projects Menu implementation, Home save/load logic and project/filter state paths are unchanged; no dependency manifests changed.

Actual managed-Chrome [GREEN receipt](browser-green.json) confirms closed `o` commits Only archived without opening; ArrowDown on selected Showing all opens/focuses Showing all; End then ArrowDown clamps at Only archived without a save; Enter closes, saves archived and shows two archived rows with zero workspace actions. Screenshots: [selected option on open](green-selected-open.png), [Enter committed](green-enter-committed.png).

The sole fixture server `c65b02db-8e80-4eb0-878b-8fa18d81be7b` and tab `1491875801` were stopped/closed at **15:26:55Z**, before the 15:33:27Z deadline. [Release receipt](runtime-release.json) proves port 48731 can bind and no matching own Vite process remains. No live preview remains.

Adjacent baseline checks: **255/255 passed**, no skips/cancellations. Exact log: [adjacent-before.tap](adjacent-before.tap). The first adjacent treatment attempt fails 151 tests because its structural fixtures hard-code AllWorkspaces imports and do not know the extracted leaf. The granted test-adapter repair now passes **255/255** with zero skips/cancellations: [adjacent-green-final.tap](adjacent-green-final.tap). The shared structural Select host compiles the actual leaf, adapts only its React-test-renderer DOM/portal primitives and transports value/open callbacks; it contains no Home filter conversion or save logic. Selection's existing fixture helper now targets the actual host button and Archive popup options, while Projects retains its checkbox lookup. The original 20 fixtures are retained in [structural-fixtures-before.tar.gz](structural-fixtures-before.tar.gz) with [SHA-256 hashes](structural-fixtures-before.sha256.json). `node evidence/home-archive-select-keyboard/verify-fixtures.cjs` passes: **20 original files, 120 test calls/bodies and 517 assertions byte-identical**, and frozen v2 unchanged ([proof](fixture-ast-proof.json)). These shallow adapters are not a substitute for the independently passing real installed Base UI DOM regression.

`npm run typecheck`: **PASS**. `npm run build`: **PASS**, including branding, TypeScript and Vite production output; existing chunk-size warnings remain. `npm run lint:colors`: **PASS**, six checker tests and no forbidden color literals. Source verification rerun: **279/279 PASS**, 50 original-byte spans. `git diff --check`: **PASS**.

Native, installed persistence, original-app interaction, full App, provider, containing-package and release acceptance remain **NOT_RUN/unverified**. Generated cloud fixture state is not real user data. Package #1791 remains unchanged and excludes any successor. No new native/provider/package campaign or duplicate watcher is authorized by this qualification.
