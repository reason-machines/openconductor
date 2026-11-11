# Home row stored-name precedence

Conductor Rebuild. Regression-first successor to merged #1089. Baseline main is `0e34c1287a73c41d3cecb37e9dc48ce34a5df381`.

## Source qualification

The retained Conductor 0.87.6 renderer is tied to real-app REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The full original asset digest, nine complete declaration spans, their UTF-8 ranges and six fresh-main source pins are in [reference.json](reference.json). No new REA engine run is claimed. The existing semantic-renderer heap-exhaustion limit remains.

The original Home caller UJo forwards workspaceName to $V. That helper takes a nonempty stored name before a PR title or prettified branch, even when userSetWorkspaceName is false. The group and row pass that result through as rendered text and title. Repository context receives the raw repository name separately.

Current homeRows already has that stored field after workspaceFromRow and archivedFromRows, but omits it from its workspaceLabel call. The shared formatter already implements the intended precedence. The source witness uses an archived workspace so its stored branch is authoritative in the original caller. No live branch-cache assumption is required.

## Frozen regression

The six cases mount production AllWorkspaces with the real persisted-row conversion, archive conversion, homeRows and label formatter. Only archive transport, preferences, agent state and decorative leaves are recorded. A row is located by role before its rendered name, title and unchanged Project A repository context are asserted.

Two cases are expected to fail before any correction. The non-user-set stored name must precede either a PR title or a different branch. Four controls cover an explicit user name, a null stored name with a PR title, a null stored name with a branch, and directory fallback on the target branch. These are static predictions until ordinary hosted CI reaches the assertions.

The fixture is frozen in [fixture-v1.ts.txt](fixture-v1.ts.txt) and fixture.sha256. The first publication contains only this test and evidence, with no product change. Actual hosted behavioral RED is required before forwarding the existing workspaceName field in the Home caller. The same fixture must then pass unchanged. Every exact-head workflow must pass before requesting merge.

## Checks and limits

- Passed source qualification on Reason cloud with Python and retained original renderer bytes. Run `python3 evidence/home-row-labels/verify_source.py --renderer <retained-renderer>`.
- Passed fixture hashing and whitespace checks. These do not execute the regression.
- Hosted regression execution is pending. Local Node, Rust, application, browser, native, provider and installed-package checks are NOT_RUN.
- No screenshot is available because this source lane has no UI execution admission. Component results will not establish native clicks, visual layout, custom tooltip behavior, real database/filesystem effects or installed-app parity.
- Scope excludes the shared formatter, sidebar, repository fallback, branch-prefix/target correction, backend, #1089 eligibility code and its frozen seven-case fixture. Type System Discipline keeps inputs derived from the existing DbWorkspaceRow and DbRepoRow types rather than introducing a duplicate schema.
