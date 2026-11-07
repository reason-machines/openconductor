# Effort submenu keyboard proof

Conductor Rebuild, 2026-11-07. Scope: only the ModelPicker effort submenu's established keyboard behavior. Fresh fetched main was `7adbf4153f9f371150f323487a0291de8a93f2b1` (includes #772). No merged branch was edited or pushed.

## Reference evidence

The parent captured these actions with REA against Conductor 0.87.6's decoded renderer in Chromium (renderer SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`). These are inherited observations, not new native-app observations by this successor.

- ArrowRight on Effort opens the submenu at Low: `ev_d578f35581e75595451bb734b800fdf71d7f6353c71caa8749b3bf5fb400a92f`.
- Enter on Effort opens the submenu at Low: `ev_95a1edd1f7569fec4f474ca3f0be9baf1d5d229486e6153702ad064869513af8`.
- Right then Down highlights Medium: `ev_a577ddaf3fd086d2c3a560e16bebca6d1fd750b65e02ae2f0d54d9a461a782ed`.
- Right then Up wraps Low to Ultracode: `ev_078a98948af555ef43fe26338a6c2322a0bdd2c70338d22a81bc10e0f914267f`.
- Right then Left hides the submenu and returns to Effort, leaving the parent open: `ev_2ca37a86f71bcdd29485a219ce87d0f96a1bd7c0ad031f04a1777fc4ae7a5de6`.
- Right, Down, Enter selects Medium, hides only the submenu and leaves the parent menu open: `ev_c8075dde2ff54a3e71a7d76489be0ec1073d5216b7a6b0961b9d4e4f7d3ff3db`.

[Parent evidence page](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3?page=47ee43b5-783c-44fb-95ca-003b690c7dd5)

[Reference Medium screenshot](https://api.reasonmachines.com/media/pr-screenshots/9ffc8f94-c5b1-46cb-8905-25a2c0b7b4d5/070d1dce0dca70959c05e74ca45fd8b8/effort-down.png)

## Reproduction and fix

Before editing ModelPicker, both visible cloud Chromium and the new focused built-fixture verifier reproduced this ArrowRight result on fresh main:

```json
{"submenuVisible":false,"focused":"EffortHigh","draft":"Keep this unsent draft","sent":""}
```

`baseline-checks.json` records seven failed cases (the downstream cases cannot advance past the failed opening assertion). Enter could open by the button's native click but left focus on Effort rather than Low. Regression-only local commit: `a550394`.

The fix adds typed trigger/option keyboard handlers. Keyboard opening focuses Low after the submenu mounts; arrows move focus; Left closes only the submenu; Enter selects the focused effort without closing the parent. Handled keys prevent their default click/submit path and stop propagation. Both handlers preserve the existing composition/default-prevented guards. Mouse handlers, effort Escape, search navigation, styles, and ComposerEditor are unchanged.

After the fix, `ours-checks.json` records seven passes. Every case asserts that the unsent draft remains intact and no send occurred. The composing-event case uses synthetic DOM events only; it does not prove real IME behavior.

## Repeat checks

Use Node/npm and Chromium with dependencies installed. The focused fixture is a lightweight Composer build, not a full app or native build:

```bash
DEMO_OUT=.qa/effort-demo npx vite build --config tools/composer/vite.demo.config.ts
DEMO_DIR=tools/composer/.qa/effort-demo PROOF_LABEL=ours node tools/composer/effort-keys.check.mjs
npm run typecheck
git diff --check
```

Result: seven focused cases passed; TypeScript and whitespace checks passed. The build completed with Vite's existing large-chunk advisory.

The managed preview was reachable from visible Chrome but not the shell's localhost namespace (`ERR_CONNECTION_REFUSED`). To run the **unchanged** existing search verifiers against the same built fixture without another server, the evidence loader fulfills their page/asset requests from that build. It does not replace browser input or app code.

```bash
ORIGIN=http://localhost:4469 OUTPUT=evidence/chat/composer/effort-keys/search-regressions node --import ./evidence/chat/composer/effort-keys/built-composer-loader.mjs tools/composer/model-search.check.mjs
ORIGIN=http://localhost:4469 OUTPUT=evidence/chat/composer/effort-keys/search-arrows node --import ./evidence/chat/composer/effort-keys/built-composer-loader.mjs tools/composer/model-arrows.check.mjs
```

Result: four existing search/no-submit checks passed; three existing search-arrow checks passed. Their JSON outputs are retained here.

The visible preview used the real dev-source Composer demo at `/tools/composer/demo.html?agent=claude&model-arrow-checks=1`. Actual CDP key input verified ArrowRight focuses Low and ArrowDown highlights Medium. The screenshot was inspected and published in the PR. `ours-medium.png` is the separately inspected built-fixture screenshot.

## Limits

No new REA call or decoded app publication was needed; no new REA bug was encountered. Reference bootstrap/license and mocked PR warnings reported by the parent are not parity evidence. Native macOS/WebKit keyboard behavior, real IME, authenticated providers, and the packaged application were not exercised. No native launch/input or real user data change was performed. No E2E workflow was manually dispatched or rerun. Consuming-main native verification belongs to the existing owner `acc3b5c5`, after merge. This change does not establish mouse-selection or effort-Escape parity.
