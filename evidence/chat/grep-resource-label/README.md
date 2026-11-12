# Grep rendered resource label

Conductor Rebuild owns this isolated regression. Only the text of the Grep resource label is in scope. File identity, navigation and search execution are not changed.

## Source

The supplied source archive SHA-256 is `1868c0d33dd9e8123362ca6fe4efa9012aed974dd6cb1b0b44f0f7713a18d04a`. All 49 manifest entries passed byte verification before the bounded excerpts were copied. `source-receipt.json` and `contract.json` retain their original bytes and historical main pin `508a1726dea81a508a853d2172ec5b1922803f2c`. Their old admission language describes the census, not the later task authorization.

Retained REA renderer identity is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, 11,600,457 bytes. Index identity is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, 3,493,297 bytes. The source route is O1o/L1o through hIt and Qpo to D0o. D0o reads raw input.path and renders xZe(path). xZe keeps the last two slash-separated segments without filtering empty segments or normalizing Unicode, relative paths, roots, trailing slashes or backslashes. These retained source claims are not new runtime observations.

Fresh main `3e4f22d2e525187b1fbb4a940d34afbe227786e5` was fetched and integrated by ordinary merge on the assigned branch. The integrated tree exactly matched main. The caller, helper, adapter, reducer, view, Transcript, Read tests and other packet snapshots still match all historical source hashes. `fresh-main.json` records the full identities. Current Grep uses shortPath(path, workspacePath); existing lastTwoSegments already implements xZe exactly. No helper change is needed.

## Frozen regression

The six original contract cases remain unchanged. Nine added cases freeze exact root, empty-segment, trailing-slash, relative, Unicode and backslash behavior before hosted baseline execution. Empty path is already an original control. Expectations are literal source-derived values, never computed with the production helper.

The new test mounts the whole production ToolRows module under real React and a controlled parent. Real Reason normalization, reducer and view deliver the genuine Grep or Read toolName/rawInput to ConductorToolRow. Assertions inspect the mounted oc-tool-inline-code text, full input identity, include/pattern/count, actual click callbacks, body and externally controlled false. The Read control checks cleaned lines 7/8, its file target and disclosure without changing existing Read tests. Only unrelated Markdown/link/backend boundaries throw if used; the label, helpers, adapter, view, highlighter and React are not replaced.

`freeze.json` records the test and all input/reference bytes before publication. `python3 evidence/chat/grep-resource-label/verify.py` checks hashes and scope only. It is not behavioral RED or GREEN.

## Gates and limits

This first ready publication is regression-only. Production is unchanged. Automatic hosted CI must observe intended component-label assertion failures with the short-path, pathless and ordinary Read controls passing before any correction. Only then may the Grep call use existing lastTwoSegments and its dedicated now-unused shortPath import binding be removed. Same frozen tests must pass, and all exact-head checks must be positive before protected merge.

No local JavaScript, tests, dependencies, typecheck, build, browser, native app, provider, workflow dispatch or rerun was used. No screenshot exists because browser/native execution is excluded. Mounted synthetic assertions do not prove real provider/IPC, native or visual acceptance. No new REA acquisition was attempted; the packet records historical source verification only. #847, image fixtures, scheduling, clock, RowShell, Transcript and shared helpers remain untouched.

Hosted baseline and candidate results are pending.
