# Reason ACP: signed-in run on a Mac

Recorded on Sven's Mac ("sven m5 max") with `reason acp` 0.2.683 signed in
(workspace Reason Tests), model `byok:anthropic:claude-opus-5-5`, driven by
[tools/reason_acp_signed_in.py](../../tools/reason_acp_signed_in.py) on
2026-11-05. [signed-in-run.json](signed-in-run.json) is run 5's summary:
`"result": "pass"`.

Run 5 (Session `9a328e45-cd8d-49be-8093-9fc49c4dcd89`, one ACP session, four turns):

| Turn | What the Session did | Tool row places |
| --- | --- | --- |
| 1 | wrote `acp-check.txt` (`local`) and read README.md on the Mac | local, relative `acp-check.txt` / `README.md` |
| 2 | moved to Reason cloud (`devices_disconnect`), wrote `acp-check.txt` there | cloud |
| 3 | wrote `acp-check.txt` (`cloud`) in `/home/runner/.reason/workspace/sessions/9a328e45.../repo` | cloud, relative `acp-check.txt` |
| 4 | follow-up `follow-up ok` in the same Session | none |

After the run the Mac's `acp-check.txt` still reads `local`, so the cloud
writes did not land on the Mac.

## What the real CLI does that the fake did not

Run 4 (same prompts, before the fix) failed. After the move to cloud,
`reason acp` reported the cloud write under the editor's folder:

```json
{"sessionUpdate": "tool_call_update", "title": "write: acp-check.txt", "kind": "edit", "status": "completed",
 "content": [{"type": "diff", "path": "/Users/sven/oc-acp-signed-in/acp-check.txt", "oldText": null, "newText": "cloud\n"}],
 "locations": [{"path": "/Users/sven/oc-acp-signed-in/acp-check.txt"}]}
```

while the same turn's `pwd` printed
`/home/runner/.reason/workspace/sessions/8f9460ff-60df-479a-9147-e44ddae86fa8/repo`.
The only signal of where the Session runs is `session_info_update`'s
`_meta["com.reasonmachines/computer"].kind`: `headless` on the Mac, `cloud`
after the move. The adapter now reads it (`computer_is_cloud` in
`src-tauri/src/reason_acp/updates.rs`), so those rows show as cloud instead
of as files on this computer.

## Other runs

- Run 1: the cloud turn had no repository checkout and only read files, so no tool row carried a path.
- Run 2: the cloud Session tried to attach reason-machines/openconductor, which the Reason Tests workspace has not connected; the driver now writes in the Session's working folder instead.
- Run 3 (`--workspace sven-2`): every turn answered that this computer's `reason connect` is in another workspace; the driver's workspace must be the one the Mac is connected in.

## Not covered

- The run drove `reason acp` directly with the same path rule as the app, not through the built OpenConductor window; the built app is covered by the e2e test with the fake CLI.
- Paths a child Session reports under `/home/runner/.reason/workspace/sessions/<child>/repo` were not seen in a signed-in run; that mapping stays as before.
