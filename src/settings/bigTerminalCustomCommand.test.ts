import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bigTerminalCommand, type CustomCommand } from "../features/terminal/bigTerminal.ts";

const source = readFileSync(new URL("./BigTerminalPage.tsx", import.meta.url), "utf8");
const input = source.match(/<input\s+type="text"\s+aria-label="Custom command"[\s\S]*?\n        \/>/u)?.[0];
assert.ok(input, "the production custom-command input exists");
const callback = input.match(/onChange=\{([\s\S]*?)\}\s*onBlur=/u)?.[1];
assert.ok(callback, "the production input has a change callback");
const change = new Function("e", "setText", "props", `return (${callback})(e);`);

function edit(value: string, command = "old-command") {
  const original: CustomCommand = { id: "selected", command };
  let draft = command;
  const changes: string[] = [];
  change(
    { target: { value } },
    (next: string) => { draft = next; },
    { custom: original, onChange: (next: string) => { changes.push(next); } },
  );
  return { draft, changes, original };
}

test("source-only: custom-command edits reach the page update callback without blur or Enter", () => {
  const value = "printf '%s' 'new command'";
  const result = edit(value);
  assert.equal(result.draft, value);
  assert.deepEqual(result.changes, [value]);
  assert.equal(result.original.command, "old-command");
});

test("source-only: deleting the command forwards an empty value", () => {
  assert.deepEqual(edit("").changes, [""]);
});

test("source-only: change callbacks preserve typed whitespace and Unicode", () => {
  const value = "  printf '%s' 'blåbær'  ";
  const result = edit(value);
  assert.equal(result.draft, value);
  assert.deepEqual(result.changes, [value]);
});

test("source-only: the forwarded edit supplies the new command to the existing preset resolver", () => {
  const value = "  printf updated  ";
  const result = edit(value);
  assert.equal(result.changes.length, 1);
  const customCommands = [{ ...result.original, command: result.changes[0] }];
  assert.equal(bigTerminalCommand({ preset: "custom:selected", customCommands, requiresToolApprovals: false }), "printf updated");
});
