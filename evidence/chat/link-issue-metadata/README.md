# Selected GitHub issue metadata

## Scope

`gh_issue_link_metadata({ repoPath, number })` reads one issue through the existing local `Gh<ProcessRunner>` boundary. It does not create a workspace, attach a file, or activate the Link issue UI.

The existing issue list, its `OpenIssue` response, and the Create From consumers are unchanged. No Composer, editor, session, or workspace-host source changes are included.

## Retained REA contract

The retained renderer maps `_Ir` through import `ani` to `S7t` in the retained index asset. The formatter consumes the issue title, `html_url`, state, required labels, singular assignee, milestone, and body. It produces `[GITHUB]-<number>.md`.

Source identities:

- `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Retained index formatter range is UTF-8 bytes `[3011807,3012203)`.
- Existing disconnected capture is `ev_c397d732e52247ddf89f2d7e53aac5c9356da5c3453c5ea45a9e8eb6d83fbb2e`.

This is static shipped-asset evidence. The disconnected capture does not prove connected selection, provider authentication, upload success, or native issue-link behavior. No new extraction or provider operation ran for this unit.

## Read contract

The selected read uses `gh api --method GET repos/{owner}/{repo}/issues/<number>` in the supplied checkout. Explicit repository addressing uses the existing validated owner and repository fields instead of placeholders. Arguments remain separate, with no shell interpolation.

The response keeps the existing wire spelling `url`, sourced from REST `html_url`, and adds `state`, `labels`, `assignee`, and `milestone`. State is `open` or `closed`. Labels are objects with `name`, the singular assignee contains `login`, and the milestone contains `title`.

The parser rejects a mismatched issue number, a pull-request discriminator, missing required fields, malformed field types, and unknown state values. Nullable body, assignee, and milestone keys must be present. Actual nulls and actual empty arrays or strings are preserved. The parser does not invent metadata or substitute the first plural assignee.

Errors use the existing operation error classifier. Missing CLI and actual authentication failures retain `no_github:`, and remote-resolution failures retain `no_remote:`. Forbidden, not-found, transport, parse, and spawn errors do not establish a synthetic authentication state.

## Verification record

- `git diff --check` passed after removing an extra EOF blank line.
- Source review passed for the five-file boundary and the unchanged issue-list methods. The registrar changes by one line.
- A dependency-only acquisition passed on Cloud 304 using the direct installed stable Cargo binary. The standalone manifest contains only `serde = 1` with derive and `serde_json = 1`.
- The single fetch used one Cargo job, nice level 19, a 6-second CPU limit, and a 90-second wall timeout. It exited zero in 9 seconds. Downloaded crate archives total 962,734 bytes. The task cache totals 8,959,248 bytes. Total HTTP transfer bytes were not separately metered. No target directory was created.
- Twelve injected-Runner metadata tests are added alongside the six existing list tests. They cover checkout and explicit-repository argv, rich metadata, true empty and nullable values, required key presence, invalid shapes and state, issue identity, pull-request rejection, invalid output, zero input, operation error tags, and spawn failures. Execution is not yet run.
- A before-change behavioral RED is not run. The new API was absent before this unit; that compile absence is not counted as behavioral RED.
- Initial hosted CI failed the PR module rustfmt check before compilation. The [macOS job](https://github.com/reason-machines/openconductor/actions/runs/42768790077/job/129671477758) supplies the exact formatting diffs. Those diffs are applied to the owned backend source only. This formatting failure is not a behavioral RED.

## Acceptance gaps

The focused Rust harness, rustfmt, and clippy are not yet run under the shared-host resource limit. Normal hosted CI remains required before merge. The harness excludes the Tauri wrappers and registrar, so native compilation is a separate check.

A real signed-in CLI read, native command invocation, connected issue selection, attachment materialization, and end-to-end Link issue parity are not run. No screenshot is supplied because this backend unit changes no visible surface.
