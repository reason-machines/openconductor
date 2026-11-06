import { test } from "node:test";
import assert from "node:assert/strict";
import { formContent, formFields, initialValues, permissionLines, statusWithOpenRequests, structuredContent } from "./codexConsent.ts";

test("an open consent is needs_user_input; a tool approval outranks it; answering both goes back to working", () => {
  assert.equal(statusWithOpenRequests("working", 0, 1), "needs_user_input");
  assert.equal(statusWithOpenRequests("needs_user_input", 1, 1), "needs_user_permission");
  assert.equal(statusWithOpenRequests("needs_user_permission", 0, 1), "needs_user_input");
  assert.equal(statusWithOpenRequests("needs_user_input", 0, 0), "working");
});

test("only a running turn moves: idle, error and cancelling stay", () => {
  for (const s of ["idle", "error", "cancelling"] as const) assert.equal(statusWithOpenRequests(s, 0, 1), s);
});

const schema = {
  type: "object",
  properties: {
    team: { type: "string", title: "Team", description: "Linear team key" },
    estimate: { type: "integer", title: "Estimate" },
    urgent: { type: "boolean", default: true },
    priority: { type: "string", enum: ["low", "high"], enumNames: ["Low", "High"] },
    size: { type: "string", oneOf: [{ const: "s", title: "Small" }, { const: "l", title: "Large" }] },
    nested: { type: "object" },
  },
  required: ["team"],
};

test("form fields follow the schema: titles, required, enums and oneOf; unsupported types are left out", () => {
  const fields = formFields(schema);
  assert.deepEqual(
    fields.map((f) => [f.name, f.type, f.label, f.required]),
    [
      ["team", "string", "Team", true],
      ["estimate", "integer", "Estimate", false],
      ["urgent", "boolean", "urgent", false],
      ["priority", "enum", "priority", false],
      ["size", "enum", "size", false],
    ],
  );
  assert.deepEqual(fields[3]!.options, [{ value: "low", label: "Low" }, { value: "high", label: "High" }]);
  assert.deepEqual(fields[4]!.options, [{ value: "s", label: "Small" }, { value: "l", label: "Large" }]);
  assert.deepEqual(initialValues(schema), { team: "", estimate: "", urgent: true, priority: "", size: "" });
  assert.deepEqual(formFields(null), []);
});

test("form content checks required and numeric fields and drops empty optional ones", () => {
  const fields = formFields(schema);
  assert.deepEqual(formContent(fields, initialValues(schema)), { error: "Team is required." });
  assert.deepEqual(formContent(fields, { ...initialValues(schema), team: "CORE", estimate: "2.5" }), { error: "Estimate must be a whole number." });
  assert.deepEqual(formContent(fields, { ...initialValues(schema), team: " CORE ", estimate: "3", priority: "high" }), {
    content: { team: "CORE", estimate: 3, urgent: true, priority: "high" },
  });
});

test("a structured (openai/form) answer must be a JSON object", () => {
  assert.deepEqual(structuredContent("{"), { error: "Enter valid JSON." });
  assert.deepEqual(structuredContent("[1]"), { error: "Structured response must be a JSON object." });
  assert.deepEqual(structuredContent('{"a":1}'), { content: { a: 1 } });
});

test("permission lines name network, read, write and entry access like Conductor's card", () => {
  assert.deepEqual(
    permissionLines({
      network: { enabled: true },
      fileSystem: { read: ["/etc/hosts"], write: ["/tmp/cache"], entries: [{ path: { type: "glob_pattern", pattern: "~/.ssh/*" }, access: "deny" }, { path: "/srv", access: "write" }] },
    }),
    ["Network access", "Read /etc/hosts", "Write /tmp/cache", "Deny ~/.ssh/*", "Write /srv"],
  );
  assert.deepEqual(permissionLines({ network: { enabled: false } }), []);
  assert.deepEqual(permissionLines(null), []);
});
