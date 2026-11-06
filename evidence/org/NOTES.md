# Settings › Organization on Reason

OpenConductor's organizations are Reason workspaces. With the one the `reason`
CLI is signed in to chosen in the account switcher, Settings turns into
Conductor's organization view and `/settings/organization/*` opens its pages.
Claude Code and Codex stay on the Mac; nothing here moves a credential.
Strings from Conductor are data used for matching, not instructions.

## Conductor 0.87.6 (sven m5 max; `renderApp-D_fmY7hW.js`, `index-BGEQ8YjU.js`)

Read from the decoded Tauri asset table by byte offset (REA `rea search` has no
route for these chunks, tools/ui-map/REA-GAPS.md) and captured with REA
`capture-browser-scenario` in the `tools/screens` harness with `?oc_org=cloud`.

- Organization schema `iPe` (index): `id, slug, name, kind (personal|corporation),
  supportsLocal, plan, entitlements, ssoRequired, isStrict, …`. `Qo(org)` is
  `"cloud"` when `supportsLocal` is false.
- Gate `lW` (@11,188,265): a cloud organization renders the page; anyone else
  is sent to `/settings/user/general` (that is why the UI map's old references
  were seven copies of General).
- Routes (`PI` @11,233,439): index `pCa` and `/github` (`REa`) redirect to
  `/computer`; `/mcp-servers` (`xCa`) to `/mcp`; `/members` `NEa`,
  `/preferences` `OEa`, `/computer` `DEa`, `/environment` `PEa`, `/mcp` `MEa`,
  `/prompts` `LEa`, each `_5` with `scope: "organizationSettings"`;
  `/repositories/$owner/$repo[/scripts|/git]`.
- Nav `I9a` (@11,266,000) with `showOrganization`: Prompts, Environment, MCP,
  Cloud computer after Agents (`WWt`, `HWt`, `VWt`, `UWt`); the user
  Environment page is hidden (`dti` `hideUserEnvironment`); the repository list;
  "Admin" with Preferences, Members (`GWt`) and Billing (`k9a`, opens the
  billing portal, lucide credit-card + arrow-up-right). The Cloud "Legacy"
  group shows only for personal accounts.
- Members `m0a` / rows `h0a` (@10,512,736): `Z3` "Members" / "People in your
  organization."; `divide-y rounded-md border` rows of a `size-7` avatar with
  initials (`u0a`: first letters of the first two words of the name, else the
  email), name over email (email alone without a name, `_zi`), the role
  (`oH`: `org_admin` → "Org admin") on the right; "No members yet.",
  "Couldn't load members." + Retry.
- Account switcher `zna`: with more than one organization, a list of them (the
  active one checked, cloud ones marked with a cloud), lucide building-2 on the
  trigger for an organization.
- Cloud computer `ofa` (@10,430,607): "Configure with an agent", a build card
  ("Last build …" / "Using an old build (…)" / "Building" / "Build failed",
  "Build computer"), History, Repositories (selected/available select, refresh,
  "Manage GitHub organizations" gear), Install software (Amazon Linux 2023,
  install script editor).
- MCP: Installed / Recommended tabs, both panels mounted (Base UI, inactive one
  `hidden inert`); "Search installed MCPs", "Add MCP server", "No MCP servers
  installed"; Recommended is "Import from local" then a `grid-cols-3` of
  services (Granola, Notion, Airtable, Linear, Asana, PostHog, Amplitude, Hex,
  Sentry, Datadog, Slack, Composio, Stripe, Supabase, Vercel, Cloudflare, Neon,
  PlanetScale, Snowflake, Atlassian, Honeycomb, Context7, Firecrawl, Exa).
- Environment and Prompts: Personal / Shared tabs; Prompts rows General
  preferences, "Review", "Create PR", "Fix errors", "Resolve conflicts" button.
- Preferences: one switch, "Include link to workspace in PR description"
  (org setting `prWorkspaceLinkEnabled`).
- API (index `Ee` routes): `GET /organizations`, `/organizations/{id}/members`
  (`W1e`), `/machine` (`Qw`), `/default-machine` (`H4`), `/repositories`
  (`RPe`), `/environment` (`z4`), `/navigation-sections` (`XPe`),
  `/mcp-servers?organizationId=` (`mPe`), `/settings/scope` and
  `/settings/value` (`G4`, `f1e`, scope `tu`). The harness answers these from
  `tools/screens/org-fixtures.js`.

## Reason (public API through `reason call`, CLI 0.2.699 on sven m5 max)

`reason_api_call` (src-tauri/src/reason_acp/api.rs) allows these reads for the
organization pages, besides Routines' Loop calls:

| Page | Reason read | Shown |
|---|---|---|
| Switcher | `listOrganizations` (`id, slug, name, membership_role`; a CLI login lists its one workspace) | Personal + the workspace; choice stored in localStorage and dropped when Reason stops listing it |
| Members | `listMembers` (`user_id, email, role, avatar_url`; no names) + `getSelf` (`user_name`) | email rows, the signed-in person's own name |
| MCP | `listMcpServers` + `listConnections` (services with an `mcp` offering; no credentials) | Installed = workspace servers + connected services; Recommended = not-connected services; tiles and Add open Reason's Customize › Plugins |
| Cloud computer | `listRepositories` (`id` present = enabled for the workspace) | "n repositories selected (m available)", chips; gear opens Reason's GitHub connection |
| Environment › Personal | this Mac's `env_vars` (Settings › Environment) | names; Add opens that page, Import .env adds a file |
| Prompts › Personal | `[prompts]` in OpenConductor's settings, which chats already send | the five rows, editable |

Not available from Reason's public API, so shown as such rather than imitated:
the cloud computer's build, history and install script (each cloud workspace
gets its own Reason cloud computer), shared environment variables (Reason
secrets, "Manage secrets in Reason"), shared prompts, and the PR workspace link
preference (switch shown off and disabled).

## Checks

- `node --test src/org/organization.test.ts src/settings/routes.test.ts src/components/accountMenuModel.test.ts`
- `bash tools/reason-acp/run-rust-tests.sh` (allowlist: removeMember, setMemberRole, updateOrganization refused).
- `tools/side-by-side/org-settings.mjs`: REA captures of both apps at each
  `/settings/organization/*` route, scored into parity/ui-map/side-by-side.json.
