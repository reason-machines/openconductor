# Reason ACP: signed-in run on a Mac

## Current attempt, 2026-11-06

The [fresh Mac attempt](signed-in-attempt-2026-11-06.json) is **blocked**, not a
new pass. CLI 0.2.700 is signed in and connected to Reason Tests. The driver
exited **2 before starting ACP**, with zero Session turns, because the required
subscription source is not available in that workspace. No Anthropic, managed
inference, API key, or alternate subscription was used.

Required source `openai-codex:42b88e79-2ef2-4e3e-93b1-8c93dcad16a7` is registered
in Reason Engineering, not in Reason Tests. Reason Tests offers Sol through
`openai-codex:desktop-local-ffc7c778-746b-4844-85ab-2db2b99cddc5` instead.
This is a difference between saved account slots. The underlying provider
identity has not been established, so the driver does not treat them as aliases.
The [source-registration record](source-registration-2026-11-06.json) contains
only supported CLI metadata, not credentials.

The driver defaults to `reason-tests`, subscription GPT-6.1 Sol, and `xhigh`.
Its assertions now require completed edit diffs with the expected local and
cloud contents, one ACP Session across all four turns, a completed cloud move,
an exact follow-up reply, and the Mac file still containing `local`. Reads,
failed writes, a child Session, or a reply that merely contains `follow-up ok`
cannot pass. Per-tool computer metadata works even when cloud rows have no
editor locations. A missing or ambiguous subscription source stops before ACP.
The preflight checks the unique available source for the requested model; the
CLI does not expose a model-source pin flag.

A reproduction against the previous verdict accepted read-only README paths
and `cannot do follow-up ok` as a pass. The same fixture now fails. The assertions
and blocked-before-ACP behavior have deterministic tests in
[test_reason_acp_smoke_checks.py](../../tools/test_reason_acp_smoke_checks.py).
These tests do not prove a signed-in runtime pass.

Run only in an isolated folder on the authorized Mac:

```bash
scratch=$(mktemp -d "$HOME/oc-reason-smoke-XXXXXX")
printf '# Isolated OpenConductor runtime smoke\n' > "$scratch/README.md"
python3 tools/reason_acp_signed_in.py "$scratch" "$scratch/proof"
```

Exit 0 means all runtime assertions passed. Exit 1 means the runtime check
failed. Exit 2 means preflight blocked before any ACP Session started. Keep the
summary for every result. An explicitly authorized source can be supplied with
`--model-source-id`; it must still be the unique available subscription source.
Do not substitute another source without authorization.

## Real-data cleanup audit, 2026-11-06

The [read-only inventory](cleanup-audit-2026-11-06.json) opened the primary real
OpenConductor database with SQLite `mode=ro` and inspected directory names only.
It found **0 test workspace rows, 0 test repository rows, and 0 `-e2e-` directory
names** under its `workspaces`, `archived`, and `repos` trees. **0 rows and 0
directories were removed.** There are 2 workspace rows and 3 repository rows.

`openconductor-playground` remains in the database and its repository directory
exists. The `bergen` workspace row remains archived and unchanged. Its stored
workspace directory and the expected archived directory were already absent
during read-only inspection. A bounded search found no Bergen-named directory
under this app data root; Git's worktree list contains the repository and Milan,
not Bergen. This audit does not establish where Bergen's files were archived.
No real workspace was recreated, removed, or modified. Chat contents were not read.

Rerun [audit_openconductor_test_data.py](../../tools/audit_openconductor_test_data.py)
with the primary app data directory. It only inventories candidates and never
deletes them. Other test app profiles and unrelated folders outside this data
root are not covered.

No OpenConductor UI was changed or driven for this attempt. There is no new
built-window or side-by-side screenshot. Local write, cloud write, and follow-up
remain unverified in a fresh signed-in Session until source access is resolved.

## Historical run, 2026-11-05

Recorded on Sven's Mac ("sven m5 max") with `reason acp` 0.2.683 signed in
(workspace Reason Tests), model `byok:anthropic:claude-opus-5-5`, driven by
[tools/reason_acp_signed_in.py](../../tools/reason_acp_signed_in.py) on
2026-11-05. This note describes run 5. The checked-in
[signed-in-run.json](signed-in-run.json) records an earlier provider-level run,
not this four-turn run. Neither is a new verification of the current build.

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
