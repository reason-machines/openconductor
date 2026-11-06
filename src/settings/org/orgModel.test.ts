import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orgActive,
  githubFullName,
  orgRepositories,
  filterMcpServers,
  isServerUrl,
  isVariableName,
  mcpServersFromReason,
  memberInitials,
  membersFromReason,
  parseDotenv,
  pendingInvites,
  prWorkspaceLinkEnabled,
  roleLabel,
  variablesFromSecrets,
  withPrWorkspaceLink,
} from "./orgModel.ts";

const list = {
  items: [
    { user_id: "u1", email: "ada@example.com", role: "owner", avatar_url: null },
    { user_id: "u2", email: "grace@example.com", role: "member" },
    { user_id: "", email: "nobody@example.com" },
  ],
  invites: [{ email: "alan@example.com", role: "member" }],
};

test("members come from listMembers, named only where Reason gives a name (getSelf)", () => {
  assert.deepEqual(membersFromReason(list, { user_id: "u1", user_name: "Ada Demo" }), [
    { id: "u1", email: "ada@example.com", name: "Ada Demo", role: "owner" },
    { id: "u2", email: "grace@example.com", role: "member" },
  ]);
  assert.deepEqual(membersFromReason({}, null), []);
  assert.deepEqual(pendingInvites(list), ["alan@example.com"]);
});

test("initials and role labels follow Conductor's u0a and oH", () => {
  assert.equal(memberInitials({ name: "Ada Demo", email: "a@x" }), "AD");
  assert.equal(memberInitials({ name: "ada  lovelace byron", email: "a@x" }), "AL");
  assert.equal(memberInitials({ email: "grace@example.com" }), "G");
  assert.equal(roleLabel("admin"), "Admin");
  assert.equal(roleLabel("org_admin"), "Org admin");
  assert.equal(roleLabel(""), undefined);
  assert.equal(roleLabel(undefined), undefined);
});

test("variables are secret names, sorted, never values", () => {
  const vars = variablesFromSecrets({ items: [{ secret_id: "ZED", name: "ZED", value: "nope" }, { secret_id: "API_URL", updated_at: "2026-11-01T00:00:00Z" }] });
  assert.deepEqual(vars, [{ name: "API_URL", updatedAt: "2026-11-01T00:00:00Z" }, { name: "ZED" }]);
  assert.ok(!JSON.stringify(vars).includes("nope"));
  assert.ok(isVariableName("NPM_TOKEN") && isVariableName("_x1"));
  assert.ok(!isVariableName("1X") && !isVariableName("A-B") && !isVariableName(""));
});

test(".env import: export, quotes, comments, last one wins", () => {
  assert.deepEqual(parseDotenv('# c\nexport A=1\nB="two words"\nC=\'q\'\nD=x # note\nbad line\nA=3\n'), [
    { name: "A", value: "3" },
    { name: "B", value: "two words" },
    { name: "C", value: "q" },
    { name: "D", value: "x" },
  ]);
});

test("MCP servers from listMcpServers, search by name or URL", () => {
  const servers = mcpServersFromReason({
    items: [
      { id: "2", name: "Sentry", transport: "http", url: "https://mcp.sentry.dev/mcp", enabled: true, connection_state: "connected", tool_names: ["a", "b"] },
      { id: "1", name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp", enabled: false, tool_names: [] },
      { name: "no id" },
    ],
  });
  assert.deepEqual(servers.map((s) => [s.name, s.enabled, s.tools]), [
    ["Linear", false, 0],
    ["Sentry", true, 2],
  ]);
  assert.deepEqual(filterMcpServers(servers, "sentry.dev").map((s) => s.id), ["2"]);
  assert.deepEqual(filterMcpServers(servers, "  ").length, 2);
  assert.ok(isServerUrl("https://mcp.linear.app/mcp"));
  assert.ok(!isServerUrl("mcp.linear.app") && !isServerUrl("ftp://x") && !isServerUrl(""));
});

test("Include link to workspace in PR description is on unless turned off", () => {
  assert.equal(prWorkspaceLinkEnabled({}), true);
  const off = withPrWorkspaceLink({ general: 1, organization: { other: true } }, false);
  assert.deepEqual(off, { general: 1, organization: { other: true, pr_workspace_link: false } });
  assert.equal(prWorkspaceLinkEnabled(off), false);
});


test("an organization page always shows the organization; elsewhere the choice counts once Reason is signed in", () => {
  assert.equal(orgActive("org-members", false, false), true);
  assert.equal(orgActive("general", true, true), true);
  assert.equal(orgActive("general", true, false), false);
  assert.equal(orgActive("general", false, true), false);
  assert.equal(orgActive(null, true, true), true);
});

test("the organization's repositories are the Reason repositories this Mac works on", () => {
  assert.equal(githubFullName("https://github.com/Tide-Labs/tide-web.git"), "tide-labs/tide-web");
  assert.equal(githubFullName("git@github.com:tide-labs/tide-api.git"), "tide-labs/tide-api");
  assert.equal(githubFullName("https://gitlab.com/a/b"), undefined);
  const reason = ["tide-labs/tide-web", "tide-labs/tide-api", "other/dotfiles"];
  assert.equal(orgRepositories(null, []), null);
  assert.deepEqual(
    orgRepositories(reason, [
      { name: "web", remote: "git@github.com:Tide-Labs/tide-web.git" },
      { name: "tide-api" },
      { name: "dotfiles", remote: "https://github.com/me/dotfiles" },
    ]),
    ["tide-labs/tide-api", "tide-labs/tide-web"],
  );
});
