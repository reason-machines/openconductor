# Pull requests: reference behavior vs our implementation

Implementation: [`src-tauri/src/pr/`](../../src-tauri/src/pr/mod.rs) (serde + serde_json, shells out to `gh`).
Tests: `src-tauri/src/pr/tests.rs`, run with [`run-tests.sh`](run-tests.sh) until the Tauri crate declares `mod pr;`. CI runs it on Linux and macOS (rustfmt check, tests, clippy `-D warnings`).

## Evidence used

Conductor v0.87.6 frontend, decoded from the app binary's Tauri asset table by `tools/extract_tauri_assets.py` (see `evidence/frontend/README.md`) on Sven's Mac under `~/code/conductor-rea-work/frontend/dist/assets/`. The two chunks below were copied byte-for-byte to the cloud build machine for reading and are not in this repo (third-party code):

| Chunk | Bytes | sha256 |
|---|---|---|
| `index-BGEQ8YjU.js` | 3,493,297 | `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` |
| `renderApp-D_fmY7hW.js` | 11,600,457 | `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` |

Both match the asset manifest's decoded sizes. Locations below are byte offsets into those files. All code and strings were read as data; nothing was executed, and our code and copy are written fresh, not copied.

| Behavior | Where (chunk @ offset) |
|---|---|
| `PrFields` GraphQL fragment and batched query (`viewerPermission`, `pr<i>ByBranch` / `pr<i>ByNumber`) | index @ ~612,500 and @ ~614,650 |
| Response schema, enums (`mergeStateStatus`, `reviewDecision`, merge queue state, permission) | index @ ~617,400 to ~619,000 |
| Node to PR info, check rollup summary, re-run de-duplication | index @ ~620,400 to ~622,000 |
| PR selection (newest open by branch, else by number), closed-PR branch check | index @ ~634,700 to ~636,500 |
| Allowed merge method query and `gh pr merge/ready/edit`, approve via REST, auto-merge on/off | index @ ~653,800 to ~657,500 |
| Merge / auto-merge actions with cached repo merge method | index @ ~713,400 and ~715,400 to ~718,000 |
| Archive-on-merge after a merge | index @ ~669,500 |
| Workspace `derived_status` from PR state, PR title/body sync | index @ ~3,165,500 to ~3,167,500 |
| Create-PR agent prompt | index @ ~2,494,000 |
| Workspace header state machine, merge-button eligibility, merge queue titles | renderApp @ ~2,194,000 and ~2,206,000 to ~2,212,000 |

## Matched

| Reference behavior | Ours | Test |
|---|---|---|
| PR fields read: number, url, author, base/head ref name and oid, viewer authored / latest review, created/updated, draft, merge state, merged at, review decision, review request count, state, auto-merge request, merge queue entry, title, body, head status check rollup | `model::PrNode` | `pr_node_deserializes_and_unknown_enums_degrade` |
| Check rollup entries are check runs or status contexts; null nodes skipped; a check run's workflow name falls back to its check suite's workflow | `model::RawCheck`, `Check::from`, `Nodes::present` | same |
| Merge is allowed for ADMIN, MAINTAIN, WRITE permission | `ViewerPermission::can_merge` | (used by later PRs) |

## Deliberate differences

- Unknown GitHub enum values (a new `mergeStateStatus`, permission or queue state) deserialize to `Unknown` / `Other` instead of failing the response; the reference's schema validation rejects the whole response.

## REA gaps hit

- `analyze-javascript-application` (Wave 0 run, `evidence/frontend/`) does not model Tauri `invoke` or shell commands, so none of the `gh` / `git` command lines the PR area runs appear in its findings. They were recovered by text search over the decoded chunks above. Logged for the REA test report.
- Sven's Mac went offline mid-investigation (`device_offline`), so a REA `trace-javascript-semantics` run anchoring these functions is pending; the offsets above are from the byte-identical copies.
