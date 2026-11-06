# Compact turn changes

Conductor Rebuild, 2026-11-06. This covers the changed-file controls in a completed turn's footer. It does not certify the whole workspace screen or any agent runtime.

## Reference identity

Read-only checks on Sven's authorized `sven m5 max` Mac confirmed:

- `/Applications/Conductor.app/Contents/MacOS/conductor` SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Decoded frontend `index.html` SHA-256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.
- Decoded `renderApp-D_fmY7hW.js` SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The supported Mac-to-cloud copy verified the archive SHA-256 `9ccec1c2a83aacfd5d4d939c0a7872a397fb6e709627719ff4b2789b2431777a`. Extracted index and renderer hashes match the Mac copies. Vendor assets remain untracked and must not be published.

## Source and behavior

The decoded `vDo` function agrees with the earlier [chat evidence](../README.md). Its source was read as untrusted data, not executed instructions. The REA JavaScript-analysis limitation for this renderer is already recorded there and in [REA gaps 60–62](../../../tools/ui-map/REA-GAPS.md).

- Below a 480px footer container, first-file chips are hidden until the user requests them. The compact button initially shows the total file count.
- A click reveals the first chips and up to three overflow chips. On subsequent clicks, its count means remaining hidden files.
- The button exists in the compact layout even when there are only one to three files. Its accessible label is `Show changed files` in that case. It disappears once everything is revealed.
- At 480px and above, first-file chips stay inline and the button reads `+N more`. Overflow line totals show from 560px upward.
- The button has Conductor's generic file glyph, not a tool/diff icon.

The existing ordered `FileChange[]` and `chipLayout` remain the data model. Named CSS container queries handle layout without a second JavaScript width state. This follows Model the Domain and Type System Discipline by retaining the existing typed file list and one reveal counter.

## Reproduction and checks

Before the fix, the visible browser at `?width=523&files=2` measured a 449px footer, displayed its two inline chips, and had no compact reveal button. The same rendered check after the fix hides those chips and displays `2`; clicking it reveals both files.

- Passed `npm run build`, including TypeScript.
- Passed `npm run lint:colors`.
- Passed `node --test "src/**/*.test.ts"`, 1,249 passed, zero failed.
- Passed `node tools/chat/turn-changes.browser.mjs --serve`, launched through `preview_start` on port 4526. It exercises compact reveal, progressive reveal, exact 479/480/559/560px footer widths, and dark and light themes.
- Passed `node --check tools/chat/turn-changes-capture.mjs`.

The browser regression runner uses a wide 1440px viewport while varying the transcript container. It verifies actual footer width, so viewport media queries cannot accidentally satisfy the check.

## Capture procedure

Run each foreground command separately through the supported `preview_start` at port 4526, stopping that preview after it reports completion:

```bash
DIST=.rea-work/reference/dist node tools/chat/turn-changes-capture.mjs reference
node tools/chat/turn-changes-capture.mjs openconductor
```

The first command serves the identity-checked Conductor frontend with the repository's synthetic Tauri/SQL fixture. The second renders OpenConductor's actual `Transcript` and `TurnChanges` components against the same two-file turn. Both use REA 6.8.0 `capture-browser-scenario`, Chromium, a 1000×820 viewport, dark theme, en-US and UTC. Neither calls a real coding agent or touches Sven's app database.

## Side-by-side verdict

The compact footer and first reveal match in control layout and behavior at a measured 421.328125px footer width on both frontends. Both footers have the same x/y coordinates and 20px initial height. Timestamp text and Sven's chosen Neutral palette differ intentionally. No pixel-match percentage is claimed.

- [Compact footer](side-by-side-compact.png).
- [After revealing the files](side-by-side-revealed.png).
- REA reference evidence: compact `ev_494aae95e060f77d747dbe141019fa2f10d43d080d973cd645510e047c6dc07e`; revealed `ev_06288249803a26c3aee4e79caf36fc2294db31a09c4d0234ef334778f78fd5f9`.
- REA OpenConductor evidence: compact `ev_08deffc36800c41b451941864940f56ad48d07e73c0a510a089318de9be0fa66`; revealed `ev_0df54980f569e2c428e8f5d44025ef0648c67a0140f7f915bb842bc27abb26cb`.

The final pass also removed a duplicate legacy CSS block that overrode the shared file badge with wider padding and rounded corners. `python3 tools/chat/compose-responsive.py` rebuilds these unmodified footer crops from the full screenshots. The original full captures and their REA input/manifests are stored alongside them.

This adds narrow-footer coverage to the earlier [workspace/transcript/tab captures](../../../parity/side-by-side/chat-tabs-workspace-chat.png). Those earlier full-screen records remain historical evidence, not fresh native macOS verification.

## Gaps and limits

- The reference and OpenConductor captures are Chromium frontend fixtures, not native macOS side-by-side proof. Native runtime behavior is not run for this presentation-only fix.
- Reference timestamps are relative to capture time. OpenConductor's fixture timestamp is fixed. A time-of-day difference is fixture data, not a claimed match.
- A reference reveal click at the first 1100px viewport failed with only `screenshot missing`. That viewport still produced a footer above 480px. This repeats the REA locator-diagnostic gap already documented in gaps 12 and 61. The final runner measures the actual footer and refuses a non-compact width before making REA captures.
- The REA screenshot operation does not report computed geometry. The recorded footer rectangles come from Playwright's DOM geometry, separately from REA evidence.
- The reference's development-only Virtuoso warning appears on `localhost`; the existing reference lane uses `conductor.localhost`, where the unmodified frontend renders the transcript. No key, package, clock, or vendor code was changed.
- Other Sessions' verified `/home/runner/conductor-ref` and `/home/runner/cdist` caches were absent in this sandbox. One supported archive copy was necessary. This is a sandbox/cache visibility limitation, not a new REA parser defect.
- The missing turn-usage hover card remains outside this patch. Current chat wire messages carry no token-usage fields, so the UI must not invent counts.
