# Settings search dismissal

Conductor Rebuild reproduced an outside-press mismatch on the built frontend from main `c0700e45d`, before changing SettingsSearch. With `Theme` entered, clicking the page at 700,200 left the query and popup visible. The same driver against Conductor's REA-extracted frontend cleared the query. Input Escape also left the query intact in the baseline driver; direct input handling now clears it without leaving Settings.

## Evidence

Reference identity reuses the [verified extraction](../local-pages/README.md) of Conductor 0.87.6 from `/Applications/Conductor.app` on authorized `sven m5 max`. This pass read back the extracted index SHA256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b` and renderApp SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. `a9a` at character offset 11204131 clears on outside-press, except within its search anchor, and handles Escape in the input. These are observations of shipped extracted code, not native runtime proof.

The same [browser regression](../../../tools/settings/check-search-dismissal.mjs) ran in each supervised preview's network namespace. `SEARCH_LANE=reference SEARCH_BASE=http://conductor.localhost:51749` used `tools/settings/reference.mjs`; `SEARCH_LANE=before` and `after` used the built application's `tools/settings/fixture.mjs`. The wrapper catches assertions to preserve the preview, so read the JSON verdict, not the server exit status.

- [Reference](reference.json) passed anchor press, outside press, clear, result selection and Escape.
- [Before](before.json) failed outside press with `query: "Theme", clearVisible: true`. The subsequent Escape assertion failed with `'Theme' !== ''`.
- [After](after.json) passed all five checks. Outside press reports `query: "", clearVisible: false`.

The fix listens for pointerdown only while search is open, excludes the search anchor and result list, and removes its listener on close/unmount. It does not prevent the underlying click. Input Escape follows the reference without waiting for the global keybinding registration. Search retains its existing query/highlight state; no new domain model or dependency is needed.

## Verification and limits

`npm run build`, the focused Settings route/provider/search-index unit tests, `npm run lint:colors` and `git diff --check` passed on Reason cloud. Screenshots use invented IPC data and Chromium at 1280x820. The supported-provider list, palette, app identity and account fixture differ deliberately. This is a dismissal-behavior comparison, not an exact full-screen pixel verdict.

No native app, agent, authentication, user data or E2E workflow was launched. Native rendering, real persistence, and Settings parity remain unverified. REA evidence was reused; no new REA analysis failure occurred.
