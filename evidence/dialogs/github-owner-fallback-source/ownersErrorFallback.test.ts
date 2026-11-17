import { test } from "node:test";
import assert from "node:assert/strict";
import { ownersErrorMessage } from "../../../src/state/githubRepoDialog.ts";

type Case = { id: string; detail: string; expected: string; basis: string };

const cases = [
  {
    "id": "generic-timeout",
    "detail": "timeout",
    "expected": "Couldn't load your GitHub accounts.",
    "basis": "Reference generic fallback; neither classifier recognizes this literal."
  },
  {
    "id": "generic-empty",
    "detail": "",
    "expected": "Couldn't load your GitHub accounts.",
    "basis": "Reference generic fallback; neither classifier recognizes this literal."
  },
  {
    "id": "generic-arbitrary",
    "detail": "Unexpected owner response",
    "expected": "Couldn't load your GitHub accounts.",
    "basis": "Reference generic fallback; neither classifier recognizes this literal."
  },
  {
    "id": "generic-server-error",
    "detail": "HTTP 502",
    "expected": "Couldn't load your GitHub accounts.",
    "basis": "Reference generic fallback; neither classifier recognizes this literal."
  },
  {
    "id": "preserve-saml",
    "detail": "Resource protected by organization SAML enforcement",
    "expected": "Your organization requires SAML single sign-on for this token. Authorize it on GitHub, then try again.",
    "basis": "Current neighboring SAML message is frozen unchanged, not claimed to match reference wording."
  },
  {
    "id": "preserve-scope",
    "detail": "missing required scope 'read:user'",
    "expected": "Your GitHub token is missing a required scope. Run gh auth refresh -s repo,read:org, then try again.",
    "basis": "Current neighboring scope classification and message are frozen unchanged, not reference-parity claims."
  },
  {
    "id": "preserve-credentials",
    "detail": "bad credentials",
    "expected": "You're not signed in to GitHub. Run gh auth login, then try again.",
    "basis": "Current neighboring auth message is frozen unchanged, not a reference-parity claim."
  },
  {
    "id": "preserve-cli-signin",
    "detail": "please run gh auth login",
    "expected": "You're not signed in to GitHub. Run gh auth login, then try again.",
    "basis": "Current neighboring auth classification and message are frozen unchanged, not reference-parity claims."
  }
] satisfies ReadonlyArray<Case>;

for (const { id, detail, expected } of cases) {
  test(`GitHub owner-load fallback: ${id}`, () => {
    assert.equal(ownersErrorMessage(detail), expected);
  });
}
