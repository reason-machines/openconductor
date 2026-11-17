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

## Hosted baseline and correction

Automatic run [43148630096](https://github.com/reason-machines/openconductor/actions/runs/43148630096) at `ced81c40e7f6fcb33ab135aaac20b20ed4c6ffff` produced qualified component-label RED. All three intended original labels failed at the mounted text assertion, along with six frozen edge cases. The short-relative, pathless and Read controls passed, as did root, leading-slash and backslash controls. The full suite reported 3,293 passes and exactly nine failures. Typecheck passed; build was skipped after unit failure. `hosted-red.json` records the cases and `hosted-red.log` retains the bounded log excerpt. Some assertion-message identifiers are redacted by the log reader; expected/actual text and assertion locations remain visible.

Before correction, fresh default main `26f8345401efb021bef2f12b17815eba6c57170c` was fetched. ToolRows, conductorTools, Reason normalization, reducer and view matched the baseline byte for byte. The only production edits now replace the Grep label call with existing lastTwoSegments and remove its dedicated unused shortPath import binding. The shared helper and all frozen tests, inputs and preserved fixtures are unchanged.

Same-input hosted GREEN and all exact-head workflows remain pending. Native, visual and real-provider acceptance remain not run.
