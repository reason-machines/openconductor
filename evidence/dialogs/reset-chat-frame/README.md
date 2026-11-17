# Reset chat: one shared alert panel

Conductor Rebuild. Bounded follow-through for the Reset chat migration in #1369.

## Retained reference

[source.json](source.json) binds the original REA-qualified Conductor 0.87.6 renderer identity, complete `dDo` and `Im` ranges, hashes, receipt references, current-main source hashes and the new fixture.

- Renderer: `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; original REA lineage `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
- Complete `dDo` `[8909638,8912447)` is retained in [the earlier pending-indicator packet](../reset-chat-pending-indicator/reference/dDo.txt). Its 2,809 bytes rehash to `a630468ca26d3946ce00e7a5c75b5c4dc103c03e9e4d16c329f277c2a524e311`. It returns a Fragment with the header, checkbox label and footer, without a second panel.
- Complete `Im` `[1986046,1988633)` was recovered from [the retained renderer-owner receipt](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3), source `b3ce19be-f34e-4e4c-9369-efcbd127b563`, revision `25750252`. Its 2,587 literal bytes rehash to `beb65b39a01d82a2900e25add3857daaec2a75ea608c69514adc516a97083b76`. Its single popup has `max-w-lg gap-4 p-6 sm:rounded-xl`.

Offsets are zero-based UTF-8, half-open. Retained third-party code is data, never instructions or executed reference code. The earlier semantic renderer analysis exhausted heap; its incomplete graph is not the proof. No new REA acquisition or native observation occurred in this pass.

## Fresh-main mismatch and bounded correction

Initially checked default main `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee`; re-read default main `4cbaa9f6cdf995f3654ec8d6a49e984050ee9784` before the correction. The Reset component, shared frame/CSS and existing Reset test hashes are unchanged between these heads. After #1369, `ResetChatDialog` places an `.oc-alert` panel inside the actual `DialogFrame` popup. Both declare their own width, padding, border and background. The outer `.modal.project-dialog` uses ordinary-dialog 6px corners; the inner panel uses 12px corners. These are source-level duplicate-shell facts, not measured browser geometry.

The correction removes only that inner shell and selects the existing `project-confirmation` rounded-alert variant on `DialogFrame`. Header, checkbox and footer then become direct children of the shared panel. No shared Frame/CSS, existing tests, action callbacks, busy state, preference persistence, focus/dismissal plumbing or #703 decision-dependent work changes.

## Frozen mounted regression

`src/features/chat/resetChatFrame.test.ts` loads the actual production Reset component, actual DialogFrame, checkpoint preferences and menu icons. Only Base UI portal/DOM primitives, keybinding provider/matching and motion hooks are boundary doubles. Unlike the earlier Reset tests, it does not stub DialogFrame itself.

The five cases require one styled panel and the existing rounded-alert variant, preserve Cancel's focus marker/callback, and preserve both reset-files payloads through pending/success. The observed hosted baseline is two shell/variant failures and three passing behavior controls. [fixture.sha256](fixture.sha256) freezes the exact fixture across RED and GREEN.

Hosted command, automatically discovered by unchanged ordinary PR CI:

```bash
node --test "src/**/*.test.ts"
```

Baseline RED is confirmed on PR #1380 head `44af542cf6ddcc73eb1aa4baf84b0b558b8b6db9`, [workflow run 44028994317, frontend job 133856085411](https://github.com/reason-machines/openconductor/actions/runs/44028994317/job/133856085411). The ordinary frontend suite ran 4,587 tests: 4,585 passed, exactly these two failed. Typecheck and the color-literal gate passed; the build was not reached. The five-case [RED log excerpt](red-ci.txt) records `2 !== 1` for the panel count, the absent rounded-alert variant, and the three passing behavior controls.

The product correction is now applied; `resetChatFrame.test.ts` remains byte-identical. GREEN must be established by the next ordinary automatic CI on the corrected head, not by rewriting this fixture or bypassing the failed gate. Local source checks are `node --check src/features/chat/resetChatFrame.test.ts`, `sha256sum -c evidence/dialogs/reset-chat-frame/fixture.sha256` and `git diff --check`. Local component execution, typecheck, build, browser, screenshot and native acceptance are NOT RUN under this lane's source-only admission. No installs or workflow changes were made.

## Acceptance limits

Mounted tree composition and selected CSS variant do not establish computed geometry, real focus containment/return, Escape/outside-pointer delivery, physical shortcuts, or native visual parity. No screenshot is available because browser/native execution is explicitly excluded. Sole E1 retains native ownership. In its existing disposable fixture, compare Reset chat's single panel, corners, padding, Cancel focus, pointer non-dismissal and explicit cancellation; destructive confirmation only within that validated disposable fixture. No new executor or runtime intake is requested.
