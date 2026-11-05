// parity:pr.checks:ui
// "Fix errors" in the Checks tab: send the failing checks' logs and the fix
// instructions to the workspace's own chat. Reference: Conductor 0.87.6
// `index-BGEQ8YjU.js` @ ~3,218,900 (`fixChecks` mutation: one attachment per
// failing job, then "Fix errors instructions.md", then the message) and
// @ ~2,506,135 (the fixErrors prompt and the user-preferences block); the
// button's rule is `renderApp-D_fmY7hW.js` @ ~2,458,500 (evidence/pr/NOTES.md).
// The instruction wording is our own. Pure: `fixErrors.test.ts` covers it.
import type { Check } from "../types";
import type { CheckLog } from "./api";

/** The chat message; the logs and instructions go along as attachments. */
export const FIX_ERRORS_MESSAGE = "Fix the failing CI actions. I've attached the failure logs.";

/** File name the instructions are attached under, as in Conductor. */
export const FIX_ERRORS_INSTRUCTIONS = "Fix errors instructions.md";

/**
 * "Fix errors" shows when a failing check has a details URL, and only for a
 * workspace with a chat; it is disabled for a read-only (archived) workspace.
 * Logs come only from GitHub Actions jobs; other failing checks add nothing.
 */
export const canFixErrors = (failing: Check[]) => failing.some((c) => !!c.detailsUrl);

/** `<name with anything but [A-Za-z0-9-_] as _>_<job id>`, then `.log` or `_status.txt`. */
export function logAttachmentName(log: CheckLog): string {
  const stem = `${(log.name ?? "undefined").replace(/[^a-zA-Z0-9-_]/g, "_")}_${log.jobId}`;
  return log.kind === "logs" ? `${stem}.log` : `${stem}_status.txt`;
}

export function logAttachmentText(log: CheckLog): string {
  const body =
    log.kind === "logs"
      ? `=== LOGS (last 1000 lines) ===\n${log.logs}`
      : `=== JOB STATUS ===\n${log.message}${log.annotation !== null ? `\n\n=== GITHUB ANNOTATION ===\n${log.annotation}` : ""}`;
  return `Failing Job Name: ${log.name}\nGitHub Job ID: ${log.jobId}\n\n${body}`;
}

/** The instructions, with the repository's `custom_prompt_fix_errors` last; it wins over the rest. */
export function fixErrorsInstructions(custom?: string | null): string {
  const parts = [
    `# Fix the failing CI checks

The pull request for this branch has failing CI checks. Their logs are attached, one file per failing job.

1. Read each log and find the first real error, not the noise after it.
2. Reproduce it locally when you can, with the same command the job runs.
3. Fix the cause in the code. Do not skip, disable or weaken a test or check to make it pass.
4. Run the check again locally, then commit and push the fix.

If a failure is not caused by this branch (an outage, a flaky runner, a broken main), say so and explain why instead of changing code.`,
  ];
  const own = custom?.trim();
  if (own) {
    parts.push(`IMPORTANT: The following are the user's custom preferences. They take precedence over the instructions above; when they conflict, follow the preferences.

## User Preferences
<user-preferences>
${own}
</user-preferences>`);
  }
  return parts.join("\n\n");
}

export interface FixErrorsAttachment {
  name: string;
  text: string;
}

/** Log files in failing-check order, then the instructions. Logs that could not be fetched are left out. */
export function fixErrorsAttachments(logs: (CheckLog | null)[], custom?: string | null): FixErrorsAttachment[] {
  const files = logs.filter((l): l is CheckLog => l !== null).map((l) => ({ name: logAttachmentName(l), text: logAttachmentText(l) }));
  return [...files, { name: FIX_ERRORS_INSTRUCTIONS, text: fixErrorsInstructions(custom) }];
}
