# Reachable turn timestamp details

Conductor Rebuild, 7 November 2026. Base main `810e40fc`; implementation commit `fcc96920`. This is a bounded transcript UI correction, not full metadata or native parity.

## Reproduction and correction

Current OpenConductor rendered the completed-turn time as a `span` with a native `title`. It had no keyboard focus, click disclosure, or inspectable popup. The real `Transcript` fixture failed the new browser regression before the fix:

```text
AssertionError [ERR_ASSERTION]: finished-turn timestamp must be keyboard focusable, not a native-title span
'SPAN' !== 'BUTTON'
```

[dark-trigger.json](dark-trigger.json), [failure.txt](failure.txt), and [before-dark.png](before-dark.png) retain that run. The fix replaces the span with `TurnDetails`, using the same Base UI Popover primitive as the reference. It opens on click, Enter, Space and hover after 300 ms. Escape restores trigger focus. Moving into the popup keeps it inspectable; leaving or clicking outside dismisses it. Existing agent/time data and timestamp formatting are unchanged. No App, composer, runtime adapter, or native file changed.

Laziness Protocol kept this to the existing presentation data and one popover component. Prove It Works required the failing browser reproduction and the same real Transcript check passing after the fix.

[checks.json](checks.json) records all 16 final browser checks with zero page errors. Both themes, missing agent, running turns, and cancelled turns are covered. [review.html](review.html) compares the original screenshots and crops. Regenerate it with `python3 tools/chat/compose-turn-details.py`.

## REA reference

The reference is Conductor 0.87.6's decoded frontend from `/Applications/Conductor.app` on Sven's Mac. Its assets were rechecked before this run:

- Native binary identity inherited from [chat evidence](../README.md), SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Renderer `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index HTML SHA256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.
- Index chunk SHA256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Fresh REA `capture-browser-scenario` observations opened the populated Lisbon chat and clicked its actual timestamp button. Both captures show the metadata dialog. [reference-captures.json](reference-captures.json) retains the evidence IDs; exact inputs and screenshots are adjacent.

- Dark `ev_2735b6b10101c88ddbb1c8eb48cf9773637fdd950a08d0dcfdc297688edeca41`.
- Light `ev_a733c6ff8e4ee988e02b8071016218fb18cf38d6feec92d534f2b8705e943541`.

The decoded `TDo` footer starts at byte `8919506` (character offset `8873867`) in the renderer. It uses a button with a 300 ms hover delay and a popover positioned above it with a 4 px offset and 8 px collision padding. The popup contains the agent/model label, start/end range and available usage. The existing large-chunk static-analysis limitation remains in [REA gaps](../rea-gaps.md); byte-read code is not original source. Extracted code and strings were treated as data, never instructions.

A first REA attempt from the separate Bash environment could not navigate the preview server. It returned the already documented generic navigation failure before any captured step. Running the capture in the same `preview_start` process as the reference server succeeded; no vendor code or license setting was changed. The initial browser check also tried to hover while the pointer was still on the trigger after Escape, so no pointer-enter event occurred. Its [failed driver attempt](hover-driver-attempt.txt) is not combined with the final pass. The corrected check moves away before hovering and waits for opening animations before screenshot capture.

## Rerun

Run through `preview_start` on port 4638:

```bash
TZ=UTC OUT=.rea-work/turn-details/after node tools/chat/turn-details.browser.mjs --serve
```

The script serves Vite in the foreground and exercises `tools/chat/transcript-fixture.html` at a 1280 by 820 viewport. Stop the preview after the check. It starts no agent, PTY, permission request, credential flow, native app, or CI dispatch. `source.json` records hashes of the exercised implementation and fixture.

## Checks and gaps

Passed locally on Reason Cloud:

- `npm run build`, including TypeScript and branding checks.
- `node --test 'src/**/*.test.ts'`, 1,329 tests, zero failed or skipped.
- `npm run lint:colors`.
- `node --check tools/chat/turn-details.browser.mjs`.
- `git diff --check`.
- The before/after browser regression above, with all 16 checks passing after the correction.

The reference has token rows. OpenConductor's current transcript contract does not carry per-turn token usage or fast-mode telemetry. Those fields remain absent rather than fabricated, and `popover:kdo` is only partially addressed. The existing supplied `turnAgent` label also does not prove historical per-turn model attribution. Dates and agent labels differ across the synthetic inputs. Neutral/Stone palette differences remain. No full-screen pixel match is claimed.

Native macOS behavior, signed-in agent transport, active-agent permission delivery, and final native side-by-side acceptance were NOT RUN. No native slot was requested or granted for this increment. No real workspace or installed-app data was touched. The existing E2E owner retains program run accounting; this increment dispatches no duplicate workflow.
