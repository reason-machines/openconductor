import { test } from "node:test";
import assert from "node:assert/strict";
import { canManage, installedMcp, memberRow, parseMembers, parseOrganizations, reconcile, roleLabel, storedOrganization, storeOrganization } from "./organization.ts";

const tide = { id: "org_1", slug: "tide-labs", name: "Tide Labs", role: "admin" };

test("listOrganizations items become organizations", () => {
  assert.deepEqual(parseOrganizations({ items: [{ id: "org_1", slug: "tide-labs", name: "Tide Labs", membership_role: "admin" }, { slug: "no-id" }] }), [tide]);
  assert.deepEqual(parseOrganizations({ items: [{ id: "o", slug: "s" }] }), [{ id: "o", slug: "s", name: "s", role: "" }]);
  assert.deepEqual(parseOrganizations(null), []);
});

test("roles: Conductor's oH label, Reason's owner/admin manage", () => {
  assert.equal(roleLabel("admin"), "Admin");
  assert.equal(roleLabel("org_admin"), "Org admin");
  assert.equal(roleLabel(""), undefined);
  assert.equal(canManage("owner"), true);
  assert.equal(canManage("admin"), true);
  assert.equal(canManage("member"), false);
});

test("member rows: name over email, else the email alone (Conductor's h0a, u0a)", () => {
  const members = parseMembers(
    { items: [{ user_id: "u1", email: "ada@example.com", role: "owner" }, { user_id: "u2", email: "grace@example.com", role: "member", avatar_url: "https://x/a.png" }, { email: "nobody" }] },
    { userId: "u1", name: "Ada Demo" },
  );
  assert.equal(members.length, 2);
  assert.deepEqual(memberRow(members[0]), { id: "u1", primary: "Ada Demo", secondary: "ada@example.com", initials: "AD", role: "Owner" });
  assert.deepEqual(memberRow(members[1]), { id: "u2", primary: "grace@example.com", initials: "G", role: "Member", avatarUrl: "https://x/a.png" });
});

test("the stored choice round-trips and follows what Reason lists", () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  assert.equal(storedOrganization(storage), null);
  storeOrganization(tide, storage);
  assert.deepEqual(storedOrganization(storage), tide);
  storeOrganization(null, storage);
  assert.equal(storedOrganization(storage), null);
  mem.set("openconductor.organization.v1", "{not json");
  assert.equal(storedOrganization(storage), null);

  assert.equal(reconcile(null, [tide]), null);
  assert.deepEqual(reconcile(tide, null), tide, "Reason unreachable: keep the choice");
  assert.equal(reconcile(tide, []), null, "signed out or removed: back to Personal");
  assert.deepEqual(reconcile(tide, [{ ...tide, name: "Tide" }]), { ...tide, name: "Tide" });
});

test("MCP › Installed: the workspace's servers, then connected services not among them", () => {
  const server = { id: "s1", name: "Linear", description: "", transport: "http", enabled: true, connectionState: "connected", url: null };
  const services = [
    { id: "linear", name: "Linear", description: "", status: "connected" },
    { id: "sentry", name: "Sentry", description: "Errors", status: "needs_attention" },
    { id: "notion", name: "Notion", description: "", status: "not_connected" },
  ];
  assert.deepEqual(
    installedMcp([server], services).map((s) => [s.name, s.connectionState]),
    [["Linear", "connected"], ["Sentry", "needs_attention"]],
  );
});
