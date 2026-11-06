import { test } from "node:test";
import assert from "node:assert/strict";
import { canFixErrors, collectFixErrors, fixShortcutApplies, FIX_ERRORS_INSTRUCTIONS, fixErrorsAttachments, fixErrorsInstructions, logAttachmentName, logAttachmentText } from "./fixErrors.ts";
import type { CheckLog } from "./api.ts";
import type { Check } from "../types.ts";

function check(over: Partial<Check>): Check {
  return {
    conclusion: "FAILURE", status: "COMPLETED", name: null, workflowName: null, detailsUrl: null,
    startedAt: null, completedAt: null, state: null, context: null, targetUrl: null, ...over,
  };
}

const logs: CheckLog = { kind: "logs", name: "unit tests (macos)", conclusion: "FAILURE", logs: "not ok 1\nexpected 2", jobId: 42 };
const unstarted: CheckLog = { kind: "unavailable", name: "e2e", conclusion: "FAILURE", message: "The job never started.", annotation: "Runner lost", jobId: 7 };

test("Fix errors needs a failing check with a details URL, Actions job or not", () => {
  assert.equal(canFixErrors([]), false);
  assert.equal(canFixErrors([check({ context: "ci/legacy", state: "ERROR", targetUrl: "https://ci.example.com/9" })]), false);
  assert.equal(canFixErrors([check({ name: "vercel", detailsUrl: "https://vercel.com/acme/web/1" })]), true);
  assert.equal(canFixErrors([check({ name: "test", detailsUrl: "https://github.com/o/r/actions/runs/1/job/2" })]), true);
});

test("log files are named after the job, as Conductor names them", () => {
  assert.equal(logAttachmentName(logs), "unit_tests__macos__42.log");
  assert.equal(logAttachmentName(unstarted), "e2e_7_status.txt");
});

test("a log file carries the job name, id and the last lines or the job status", () => {
  assert.equal(logAttachmentText(logs), "Failing Job Name: unit tests (macos)\nGitHub Job ID: 42\n\n=== LOGS (last 1000 lines) ===\nnot ok 1\nexpected 2");
  assert.equal(
    logAttachmentText(unstarted),
    "Failing Job Name: e2e\nGitHub Job ID: 7\n\n=== JOB STATUS ===\nThe job never started.\n\n=== GITHUB ANNOTATION ===\nRunner lost",
  );
  assert.ok(!logAttachmentText({ ...unstarted, annotation: null }).includes("ANNOTATION"));
});

test("the repository's fix-errors prompt goes last, and a blank one adds nothing", () => {
  const plain = fixErrorsInstructions(null);
  assert.equal(fixErrorsInstructions("   "), plain);
  const own = fixErrorsInstructions("  Run make ci first.  ");
  assert.ok(own.startsWith(plain));
  assert.ok(own.endsWith("<user-preferences>\nRun make ci first.\n</user-preferences>"));
});

test("attachments are the fetched logs in order, then the instructions", () => {
  const files = fixErrorsAttachments([logs, null, unstarted], "x");
  assert.deepEqual(files.map((f) => f.name), ["unit_tests__macos__42.log", "e2e_7_status.txt", FIX_ERRORS_INSTRUCTIONS]);
  assert.deepEqual(fixErrorsAttachments([null]).map((f) => f.name), [FIX_ERRORS_INSTRUCTIONS]);
});

test("git.fixErrors runs only with a failing check that has a details URL, no fix in flight, and a live workspace", () => {
  const failing = [check({ name: "unit", detailsUrl: "https://github.com/o/r/actions/runs/1/job/2" })];
  assert.equal(fixShortcutApplies(failing, false, false), true);
  assert.equal(fixShortcutApplies(failing, true, false), false, "a fix is already in flight");
  assert.equal(fixShortcutApplies(failing, false, true), false, "archived workspace");
  assert.equal(fixShortcutApplies([], false, false), false, "nothing failing");
  assert.equal(fixShortcutApplies([check({ context: "ci/legacy", targetUrl: "https://ci.example.com/9" })], false, false), false, "no details URL");
});

test("the shortcut and the button send the same thing: Actions job logs (failed fetches left out), then the instructions with the repo prompt", async () => {
  const job = check({ name: "unit tests (macos)", detailsUrl: "https://github.com/o/r/actions/runs/1/job/42" });
  const broken = check({ name: "lint", detailsUrl: "https://github.com/o/r/actions/runs/1/job/43" });
  const external = check({ name: "vercel", detailsUrl: "https://vercel.com/acme/web/1" });
  const asked: string[] = [];
  const files = await collectFixErrors("/wt", [job, broken, external], "r1", {
    log: async (wt, c) => {
      asked.push(`${wt}:${c.name}`);
      if (c.name === "lint") throw new Error("HTTP 500");
      return logs;
    },
    customPrompt: async (id) => (id === "r1" ? "Run npm test first." : null),
  });
  assert.deepEqual(asked, ["/wt:unit tests (macos)", "/wt:lint"], "only Actions jobs are fetched");
  assert.deepEqual(files.map((f) => f.name), ["unit_tests__macos__42.log", FIX_ERRORS_INSTRUCTIONS]);
  assert.match(files[1].text, /<user-preferences>\nRun npm test first\.\n<\/user-preferences>/);
});
