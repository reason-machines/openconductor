import { test } from "node:test";
import assert from "node:assert/strict";
import { orgsErrorMessage } from "../../../src/state/githubRepoDialog.ts";

const cases = [
  {
    "id": "generic-timeout",
    "detail": "timeout",
    "expected": "Couldn't load your GitHub organizations. You can still use your personal account.",
    "basis": "Retained vas generic message is rendered after personal-owner success and organization-load failure. Neither classifier matches this detail."
  },
  {
    "id": "generic-server-error",
    "detail": "HTTP 502",
    "expected": "Couldn't load your GitHub organizations. You can still use your personal account.",
    "basis": "Retained vas generic message; neither retained r2t nor current read:org classifier matches this detail."
  },
  {
    "id": "preserve-read-org",
    "detail": "missing read:org scope",
    "expected": "Couldn't load organizations: your token needs the read:org scope. You can still use your personal account.",
    "basis": "Current specialized read:org classifier and message remain unchanged. This control is not a specialized-copy reference-parity claim."
  }
] satisfies ReadonlyArray<{ id: string; detail: string; expected: string; basis: string }>;

for (const { id, detail, expected } of cases) {
  test(`GitHub organization-load note: ${id}`, () => {
    assert.equal(orgsErrorMessage(detail), expected);
  });
}
