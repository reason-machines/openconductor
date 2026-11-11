import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { directoryNameError, directoryNameFor, planRename } from "./workspaceRename.ts";

const referenceRoot = new URL("../../evidence/sidebar-rename-unicode/reference/", import.meta.url);
const reference = ["YQe.txt", "QQe.txt", "XQe.txt"]
  .map((file) => readFileSync(new URL(file, referenceRoot), "utf8"))
  .join("\n");

function originalPlan(input: string): unknown {
  return runInNewContext(
    `${reference}\nconst directoryName = QQe(input); JSON.stringify({ directoryName, error: XQe(directoryName) ?? null });`,
    { input },
    { timeout: 1_000 },
  );
}

for (const { category, name } of [
  { category: "nonspacing mark", name: "q\u0301" },
  { category: "enclosing mark", name: "q\u20dd" },
  { category: "spacing mark", name: "q\u093e" },
]) {
  test(`workspace rename preserves an NFC-stable ${category} accepted by Conductor`, () => {
    assert.equal(name.normalize("NFC"), name);
    assert.equal(originalPlan(name), JSON.stringify({ directoryName: name, error: null }));
    assert.equal(directoryNameFor(name), name);
    assert.equal(directoryNameError(name), undefined);
    assert.deepEqual(planRename({ directoryName: "lisbon", workspaceName: null }, name), {
      kind: "rename",
      newDirectoryName: name,
      workspaceName: null,
    });
  });
}

test("ordinary rename normalization still matches the retained Conductor helpers", () => {
  assert.equal(originalPlan("  Fix Login  Redirect! "), JSON.stringify({ directoryName: "fix-login-redirect", error: null }));
  assert.equal(directoryNameFor("  Fix Login  Redirect! "), "fix-login-redirect");
  assert.equal(directoryNameError("fix-login-redirect"), undefined);
  for (const invalid of ["", "a/b", "..", "a b", "q\u200d", "q😀"]) {
    const expected = invalid ? "Name can only contain letters, numbers, hyphens, and underscores" : "Invalid workspace name";
    const result: unknown = runInNewContext(`${reference}\nXQe(input);`, { input: invalid }, { timeout: 1_000 });
    assert.equal(result, expected);
    assert.equal(directoryNameError(invalid), expected);
  }
});
