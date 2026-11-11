import assert from "node:assert/strict";

export function verifyHeaderMenuResults(results, caseIds, expectation) {
  assert.ok(["baseline", "candidate"].includes(expectation), "unknown result expectation");
  assert.equal(caseIds.length, 8, "the frozen contract contains eight cases");
  assert.deepEqual(results.map(({ id }) => id), [...caseIds], "all eight cases must finish in order");
  for (const [index, result] of results.entries()) {
    assert.equal(result.phase, "behavior", result.id + ": setup failure is not RED");
    if (expectation === "candidate" || index < 2) {
      assert.equal(result.status, "passed", result.id + ": " + (result.error ?? result.status));
      continue;
    }
    assert.equal(result.status, "failed", result.id + ": baseline no longer reproduces the missing menu");
    assert.match(result.error ?? "", /locator\.waitFor: Timeout 3000ms exceeded/, result.id);
    assert.match(result.error ?? "", /waiting for getByRole\(['"]menu['"], \{ name: ['"]Workspace actions['"], exact: true \}\) to be visible/, result.id + ": failure is not the missing workspace menu");
  }
}
