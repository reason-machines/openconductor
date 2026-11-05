# REA gaps hit on the chat rendering slice

1. `analyze-javascript-application` on `renderApp-D_fmY7hW.js` (11.6 MB, one minified chunk) exhausts an 8 GiB worker heap after ~10 min and silently drops the file: the run still exits 0 with `ok: true`; only a limitation string says the file was skipped. There is no per-file streaming or "functions only" mode for large chunks, so the chat transcript components (all in that chunk) have no REA function nodes.
2. The run over `index-BGEQ8YjU.js` returns 0 `literal` semantic nodes (only expression/function/binding/... kinds), so UI strings such as `"tool call"` or `"Copy final message"` cannot be located through REA Evidence; they had to be found by byte search in the decoded bundle.
3. Function nodes carry minified names and line/column ranges but no source text, so reading what a function does still needs the bundle itself.
4. `--source-path` must be relative to the artifact root passed as `<path>`, but the error for a wrong prefix ("Select an exact relevant file path from the artifact inventory") does not list the inventory paths or the expected root.
5. Bun single-file executables are still unsupported (as in the Wave 0 report): `conductor-runtime`'s JS (`// conductor-runtime.js`, 13 MB at file offset 0x3bd4027) was cut out by hand; `analyze-javascript-application` on it timed out at the 300 s default (Evidence `ev_62f484ed…` partial).
6. With `TMPDIR` under a deep session path, REA's Chromium-based helpers fail with "Socket path too long" (not REA-specific; set `TMPDIR=/tmp/...`).
