# Native app zoom boundary

Conductor Rebuild requalified the Settings zoom consumer against main `15e87440daa703030f4c402e7a41b9221a149768`.

## Reference

The retained REA extraction is from real Conductor 0.87.6 on Sven's Mac. Its renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. `source.json` records UTF-8 byte offsets and hashes for each retained excerpt. The original full asset and each copied excerpt were checked before implementation.

The effect calls the current Webview's `setZoom(Z)` and records `--webview-zoom`. It separately gates native traffic-light repositioning and the resize listener on macOS major version 26 or later. The retained SDK calls `plugin:webview|set_webview_zoom` with the webview label and fraction.

OpenConductor's baseline consumer only sets CSS document zoom. The lockfiles resolve API 2.12.4, Tauri 2.12.5, tauri-utils 2.10.2 and tauri-runtime 2.12.2. Retained matching crate source establishes that native zoom requires `core:webview:allow-set-webview-zoom`, absent from `core:default`. The omitted `zoomHotkeysEnabled` flag defaults to false and remains false through config-to-runtime conversion. This change does not enable Tauri's separate 20% hotkey polyfill.

## Change

`nativeZoom.ts` selects one scale mechanism. Browser previews retain the existing CSS behavior. Native mode clears CSS zoom and uses the public current-Webview SDK. Requests are ordered; a failed request does not prevent a later one. Repeated confirmed scale values do not reissue native calls during unrelated Settings saves.

`applyAppearance` reports native rejection through its diagnostic boundary. It does not silently apply CSS as though native scaling succeeded, or roll back a successfully persisted setting. The adapter records `--webview-zoom` only after a successful SDK reply. No additional UI error surface is introduced.

Only one capability is added for the existing main window. Settings storage, defaults, fractions, ranges, shortcuts, themes, ligatures, fonts and General Full Disk Access are unchanged.

## Verification

- `python3 evidence/settings/native-zoom/replay.py --source-only` checks the frozen baseline, reference excerpts and byte-identical fixture.
- The hosted `Settings native zoom boundary` workflow runs `python3 evidence/settings/native-zoom/replay.py --out-dir "$RUNNER_TEMP/native-zoom-replay"` after `npm ci`.
- The replay runs the same nine-case fixture against the recorded baseline and candidate. It requires exactly eight named baseline assertion failures and one passing browser control, then all nine candidate cases passing. Raw TAP and JSON results are uploaded.
- The fixture uses the installed real API's current-Webview lookup and setter, replacing only the IPC transport. It covers fractions 0.5, 1, 1.5 and 3, browser reset, delayed native replies, permission rejection, retry and successful-call deduplication.
- Existing exact-head CI supplies TypeScript, frontend build, full unit tests, Tauri compilation and packaging checks. Results remain pending until the hosted runs finish.

## Explicit limits

This is a source/API-call correction, not observed native parity. No local Node, browser, Rust or native execution ran in this lane. There is no screenshot because native UI execution remains with the sole native executor.

WKWebView scale, actual permission acceptance, pointer and menu geometry, display scaling, first launch, restart and native resize/reset behavior remain **NOT_RUN**. Mocked IPC cannot establish them.

The native owner has no verified `update_traffic_light_position` handler or coordinate semantics to supply. macOS 26+ traffic-light repositioning and its resize listener remain **unimplemented**. This change deliberately adds no guessed offsets, native host command or `data-scaled-native-traffic-lights` claim. The reference's renderer call contract alone is not a native implementation specification. This evidence gap is retained rather than treated as a REA tool failure.
