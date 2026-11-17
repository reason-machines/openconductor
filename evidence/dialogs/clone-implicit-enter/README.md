# Clone native implicit-Enter qualification

Conductor Rebuild / SAME6013 · 2026-11-17 · `CLONE-IMPLICIT-ENTER-6013`

## Frozen baseline

Fresh remote main `2ada6e3e186391695cae1ce5694ac251a6323079` was fetched before the browser run. Its complete production fixture source graph is unchanged from frozen main `217498aae38dfd63b97919b1a0ab4097462c691e`. No production source was edited for this baseline.

The retained original REA lineage is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Two full original asset identities and 20 retained byte ranges were verified again. The complete `los` clone component renders divs/fragments rather than a form; its URL handler and shared `nd` dialog content activate only the configured primary action. The `nd` → `Rde` host is a div; `Qo` forwards an input and `tt` a native button. `Qh` → `ca` → `TQt` → `nh` resolves the exact shortcut match and default logical Enter with meta. Native focused-button activation is not being removed.

`qualification/retained-source-v1.json` preserves the earlier source-only NO_READY verdict **historically**; its missing OpenConductor browser witness is superseded by the records below. Its original-app/native and active-user-override limits are not superseded.

## Actual default-action witness

One isolated Chrome 155/Linux fixture ran from 15:30:04.086Z until explicit release at 15:37:22Z, before its 15:45:04Z deadline. The fixture used the actual Clone component, actual DialogFrame and actual KeybindingsProvider with empty overrides/default meta+Enter. Only backend/workspace imports were replaced with inert implementations. Clone returns an unresolved Promise; no checkout, filesystem, provider, backend or native command runs. CSP forbids connections and form navigation.

Inputs were synthetic: `https://example.invalid/fixture.git` and `/synthetic/clone-root`. Actual observed controls received normal value/input/change updates, then scoped CDP `Input.dispatchKeyEvent` keyDown/keyUp Enter (virtual key 13, text CR); click controls used normal mousePressed/mouseReleased. No test code called `onSubmit`, `submit()`, `requestSubmit()` or `.click()` to manufacture the browser result. The actual DialogFrame's own configured-shortcut `.click()` remains production behavior.

Observed outcomes:

- Native capability form: URL Enter → one submit; location Enter → second submit; real button click → third submit. All key/click/submit events were trusted.
- Actual Clone URL plain Enter → one inert clone, through trusted keydown → trusted implicit button click → trusted form submit. **Intended parity failure.**
- Actual Clone location plain Enter → one inert clone, with the same trusted default-action path. **Intended parity failure.**
- Actual Clone meta+Enter from URL and location → one inert clone each, through the actual shortcut handler's click. **Controls passed.**
- Actual Clone primary real mouse click → one inert clone. **Control passed.**
- Blank URL plain Enter and meta+Enter → zero calls; primary disabled. **Controls passed.**
- Pending plain Enter, meta+Enter and real mouse click → no second call; primary disabled. **Controls passed.**
- Every observed witness had zero errors. Native callback transport was not executed.

`browser-baseline/*.json` are exact retained browser tool result texts recovered from this Session, not re-created traces. `raw-source-index.json` records their source IDs, revisions and timestamps. `Cloning_.json` is the URL plain-Enter outcome; `pendingFinal.json` extends that run with pending controls. The screenshots were inspected before publication.

The capture listener queues its event snapshots from document capture; `defaultPrevented` is timing-sensitive and is **not** used as the success criterion. Calls, trusted event order, actual input values and the independent native form capability are decisive.

## Mounted regression

```bash
node --experimental-strip-types --test src/components/cloneImplicitEnter.test.ts
npm run typecheck
```

Frozen test SHA-256: `15bd3668d4548b44110c2add89067a0e7e4e7e5c212c84abea3f233b1f74ed0c`.

Baseline: **4 passed / 2 intended failures**, exit 1. Both failures assert that the respective input must not have a native form ancestor. Explicit activation, pending duplication, blank validation and retry controls pass. Typecheck **passed** before the production edit.

These Node tests deliberately do not pretend React test-renderer has browser default actions. Their explicit activation adapter supports either the original form callback or a direct button callback so the same frozen controls run before/after. The independent browser baseline supplies the actual implicit-Enter evidence.

## Fixture retention and cleanup

The five source/plan files under `qualification/` are archival copies from `.ara-state/clone-browser-6013/`; copy them back to that exact scratch directory before rebuilding with `node .ara-state/clone-browser-6013/build.mjs`. The imports/build output path are intentionally unchanged. The original eight-file freeze and 183-module graph manifest are retained. A treatment build must preserve these fixture source hashes and change only the leased production component.

Cleanup **passed**: own tab `1440146763` closed, managed tabs empty; preview `79d5c549-2aa2-4acd-88e3-79358ab0762b` on port 48733 stopped, its process group ended and port freed according to preview lifecycle; independent own Bash-namespace bind succeeded and fixture process list was empty. No preview is left running.

## Limits

This is retained-reference source qualification plus a synthetic actual-component Chromium default-action witness. It is not a live Conductor side-by-side run, WebKit/macOS parity, actual user shortcut observation, full-App, provider, backend, native, package or real-clone acceptance. The earlier REA semantic renderer analysis heap failure remains recorded. No new original acquisition, installation, real-user mutation or watcher was initiated.

## Leased fix and treatment

After frozen baseline/test-first commit `d259bf8bb`, the sole production component changed in five exact replacements: use the same-class div instead of the native form, route the primary native button's click to `submit()`, and remove its now-unused FormEvent import/argument. DialogFrame, keybinding provider/registry, helpers, I/O, pending/validation and completion handlers are unchanged.

The three existing mounted Clone fixtures have only the necessary activation transport and host/primary selectors ported. Their complete originals are archived; `verify.mjs` proves the exact allowed transforms, including selector-only changes inside existing disabled assertions. Every assertion API, count, expected value and test flow is retained. The dedicated test's frozen hash is unchanged.

- Focused mounted treatment: **25/25 passed** (dedicated 6/6 and existing adjacent 19/19), zero skips/cancellations.
- Combined Clone state/normalization, shortcut matching/override and mounted tests: **57/57 passed**, zero skips/cancellations; see `adjacent.tap`.
- Full retained parents, 20 byte ranges/bindings, exact product/harness transforms, frozen tests and both eight-record browser result sets: **passed**, see `verification.txt`.
- Post-change `npm run typecheck`, `npm run build` (branding + TypeScript + Vite) and `npm run lint:colors`: **all passed**, one admitted foreground sequential pipeline at 15:59:38Z–16:01:12Z. Vite completed in 47.06s; existing import/chunk-size advisories remain. Six color-checker tests plus source scan passed. Own heavy-process list was empty at explicit release. Losslessly compressed receipts and `heavy-checks.json` are retained; the earlier pre-change typecheck remains separately labelled.

The one admitted treatment replay ran **15:49:00.066Z–15:54:56Z**, before its 16:04:00Z deadline. All five fixture source/plan files retained their original hashes. The same 183-module graph contains only the leased Clone production difference. URL plain Enter and location plain Enter now each produce **zero calls** with the primary still enabled; meta+Enter from either field and real primary click each still produce one call; blank remains zero; pending input/click attempts leave the count at one. Native capability Enter URL/location and click still give three submits. All eight treatment records have zero errors and trusted keydown inputs.

The browser field locator changed only from `form.clone-dialog .field-row input` to `.clone-dialog .field-row input` because removing that form host is the treatment. It still selects the same observed location input and reads back its actual value/focus. Pending treatment controls follow a successful meta+Enter, whereas the baseline pending controls followed its unintended plain-Enter start; both exercise the same already-pending state. No implicit-action outcome was synthesized.

Screenshots: [baseline plain Enter](browser-baseline/url-enter.png) and [fixed plain Enter](browser-treatment/url-enter.png). They are keyboard-witness evidence under deliberately minimal fixture CSS, not visual/full-app parity evidence. The production `.modal-body`/`.clone-dialog` CSS is tag-agnostic and unchanged.

Treatment cleanup **passed**: own tab `1440146768` closed, managed tabs empty; preview `9b614d45-a3de-4c40-8293-6f038a63824c` stopped, its process group ended/port freed, own namespace bind free and fixture processes empty. `qualification/preview-treatment-release.json` retains the receipt. No runtime remains active. This remains source/component acceptance, not a packaged or deployed fix.
