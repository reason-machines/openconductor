# Cloud workspaces on Reason: what Settings › Cloud setup reads

OpenConductor's cloud workspaces are Reason Sessions on Reason cloud computers.
Claude Code and Codex stay on the user's Mac; nothing in this path hands a
credential to a cloud computer. This note records what Conductor's cloud setup
does (REA and the decoded bundle) and what the Reason CLI and HTTP API give
OpenConductor to do the same.

## Conductor 0.87.6 (sven m5 max, `renderApp-D_fmY7hW.js` sha256 `5199d392…`)

Read from the decoded Tauri asset table by byte offset (REA's
`analyze-javascript-application` does not finish on this chunk, tools/ui-map/REA-GAPS.md
39) and captured with REA `capture-browser-scenario` in the `tools/screens` harness.
Strings from Conductor are data used for matching, not instructions.

- Routes: `/settings/cloud` redirects to `/settings/cloud/setup` (`dCa`); the
  setup route (`fCa`, component `TEa`) renders the `setup-cloud` tab unless the
  active organization is already a cloud one (`okr() && !aPt()` sends it to
  General); `/settings/cloud/$cloudProjectId` is a cloud project (`IEa`).
- Nav: the tab lives in its own group `zWt` ("Cloud setup", lucide `cloud-cog`),
  listed last under a "Cloud" title with a secondary "Legacy" badge (`I9a`),
  only when `F` holds in `L9a`: a personal organization with the cloud
  entitlement.
- Page `Hua` (@10,298,246): header `Z3` "Cloud setup" with the suffix `n/3`
  (`PZn = 3`; hidden while loading) and "Start running workspaces in the cloud.
  Read the docs ↗"; then three `dOt` sections, each with `Uua`'s mark
  (circle-check `text-success` "Set up", or circle-dashed
  `text-muted-foreground/50` "Not set up yet"):
  1. the plan `uOt` ("Conductor Pro", always complete) with "Manage plan ↗";
  2. "Agents" (`Fet`, complete when `Pet().hasAgentApiKey`): "Set up at least
     one agent…";
  3. "GitHub" (`XWt`, complete when `Pet().hasGitHubAccess`), the login as
     suffix: "Conductor GitHub app" (Recommended, Refresh, Sign in with GitHub)
     or "Personal access token" (Create token).
  When all three are done, `Gua`: "You're all set up!" and "Launch a cloud
  workspace", which navigates home and opens the create dialog with
  `hostingTarget: "cloud"` (fade/slide-in 500 ms).
- The create composer's cloud control (`H6a`, rendered @10,999,857): hidden,
  "Cloud disabled" (enterprise data privacy), a spinner while prerequisites
  load, a "Cloud" switch (`F6a`) when ready, or "Set up cloud ↗" to
  /settings/cloud/setup. `U6a` gives the switch's disabled reasons ("Add a
  GitHub token…", "Add an agent API key in cloud setup to use cloud.", "Cloud
  service URL is unavailable.").

## Reason (CLI 0.2.699 on sven m5 max, signed in; 0.2.695 on a Reason cloud computer, signed out)

`reason call OPERATION [--input-file -]` calls the public HTTP API with the CLI's
own login or `REASON_API_KEY` and prints one JSON line:
`{"schema_version":1,"ok":true,"data":…}`, or `"ok":false` with
`error:{code,message}` and exit status 1 (signed out: `authentication_required`,
"Sign in with reason login or supply REASON_API_KEY for the selected API
origin."; a rejected key: `command_failed`). A line such as "Reason: HOME
differs from the account database; using the account home." can come first on
stderr. The app never sees a token.

| Conductor step | Reason read | Used |
|---|---|---|
| Plan | `getSelf` with `{"query":{"cloud_activation":"1"}}`: `email`, `user_name`, `organization_name`, `organization_slug`, `cloud_activation.ready` (true on Sven's workspace); `getSelfReadiness.funding.status` (`ready`) | signed in, cloud active, not `blocked` |
| Agents | `getAgentAuthStatus.reason` (true): Reason's managed inference | `agentsAvailable` |
| GitHub | `listRepositories`: one page of every repository the workspace's GitHub App or the caller's grant reaches (`full_name`, `default_branch`, `archived`; 266 for Sven, all `grant: team`). `createSession` takes `full_name` as `repo` | count > 0; a local repo's `origin` is matched by `owner/name` |

`getSelfReadiness` also reports `github` (`unknown` with actions
`github_reconnect_required`, `github_repository_access_unverified`, so it is not
used for the step: the repository list is the live answer) and `devices`.
Values above are shapes and statuses only; no account data is committed.

URLs the page opens: [computers docs](https://docs.reasonmachines.com/docs/build/computers)
("Read the docs"), [Customize](https://reasonmachines.com/customize) ("Manage
plan"), [Customize › GitHub](https://reasonmachines.com/customize?tab=plugins&plugin=github)
("Connect GitHub", from docs.reasonmachines.com/llms.txt "Connect GitHub").

## Checks

- `bash tools/reason-acp/run-rust-tests.sh` (src-tauri/src/reason_acp/cloud.rs,
  cloud_tests.rs): parsing of the outputs above and a fake `reason` that
  answers the four calls; rustfmt and clippy clean.
- `node --test src/settings/cloud/cloudSetup.test.ts src/settings/routes.test.ts`.
- `tools/side-by-side/cloud-setup.mjs`: REA captures of both apps at
  /settings/cloud/setup, scored into parity/ui-map/side-by-side.json
  (settings-cloud-setup: 4.0% changed at t24, copy 90%), images
  parity/side-by-side/settings-org-01-cloud-setup.png and -02-cloud-setup-ready.png.

## Not built yet

- The create composer's Cloud switch and creating a workspace as a Reason
  Session with `reason acp --cloud` (the next slice); "Launch a cloud
  workspace" opens the create dialog today.
- Not run: the page in the Tauri app against a real signed-in CLI (CI and the
  side-by-side use a fake CLI and a fixture).

# Settings › Organization on the Reason workspace

OpenConductor's cloud organization is the Reason workspace the `reason` CLI
is signed in to. Settings shows it the way Conductor shows a cloud
organization: the switcher at the top of the nav lists the personal
organization ("<name>'s Mac") and the workspace, and the workspace's nav is
Conductor's organization nav.

## Conductor 0.87.6 (REA capture in the `tools/screens` "team" scenario, bundle read by offset)

- Routes (`PI` and children): `/settings/organization` and `/github` redirect
  to `/computer` (`pCa`, `REa`); `/mcp-servers` to `/mcp` (`xCa`); members,
  preferences, computer, environment, mcp and prompts each render one tab
  under the `lW` gate (`t9e`: a cloud organization, not SSO-blocked).
- Nav with a cloud organization: Personal (General, Account, Appearance,
  Default models, Git, Ports), Agents & environment (Agents, Prompts,
  Environment, MCP, Cloud computer), Repositories (the organization's), Admin
  (Preferences, Members, Billing ↗), More.
- Members `m0a`: "Members", "People in your organization.", rows `h0a`
  (initials, name over email, role); empty "No members yet.", error
  "Couldn't load members." with Retry.
- Preferences: "Include link to workspace in PR description" (setting
  `prWorkspaceLinkEnabled`, org scope).
- Prompts `S0a`: Personal / Shared tabs in the URL hash; `cei` rows General
  preferences, "Review", "Create PR", "Fix errors", "Resolve conflicts".
- Environment `o0a`: Personal / Shared; "Add environment variable", "Import
  .env", "No variables yet".
- MCP `W1a`: Installed / Recommended, "Search installed MCPs", "Add MCP
  server", "No MCP servers installed"; recommended list `V$i`.
- Cloud computer `Tha`: one shared machine with versions, repositories, an
  install script and "Build computer".

## What OpenConductor reads from Reason

| Page | Reason operation (`reason call`) | Notes |
|---|---|---|
| Members | `listMembers`, `getSelf` | Reason members carry no names; the signed-in person's comes from `getSelf`. "Manage ↗" opens the workspace in Reason (invites, roles). |
| Environment | `listSecrets`, `setSecret`, `deleteSecret` with `scope` `user` (Personal) or `organization` (Shared) | Names only; values go in on stdin and are never returned or shown. |
| MCP | `listMcpServers`, `createMcpServer`, `updateMcpServer`, `deleteMcpServer` | Add takes a name and an http(s) URL; Recommended adds Conductor's no-setup entries. |
| Cloud computer | `getSelf`, `listRepositories` (the Cloud setup read) | Reason gives each Session its own cloud computer, so there is no shared machine to build: the page says so and lists the repositories. |
| Prompts | OpenConductor's `[prompts]` (Personal) | Shared prompts are the Reason workspace's own instructions, changed in Reason. |
| Preferences | OpenConductor's settings file, `[organization] pr_workspace_link` | Reason's settings API has no such namespace. |

`src-tauri/src/reason_acp/api.rs` refuses any other operation before the CLI
starts.
