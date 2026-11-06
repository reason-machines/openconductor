// Help › "Submit a prompt" (Conductor 0.87.6 `W5a`, decoded renderApp-D_fmY7hW.js
// @11,132,912; submit `V5a`). Conductor POSTs the prompt to its feedback proxy
// as "[PROMPT SUBMISSION]" with the name and prompt, plus the app version and
// OS. OpenConductor has no feedback service: the same text opens as a new
// GitHub issue on its repository, which is where its feedback goes already
// (Send feedback). Pure: unit tested in submitPrompt.test.ts.
import { REPO_URL } from "./helpMenuItems.ts";

export const SUBMIT_PROMPT_DIALOG_ID = "submit-prompt";

export const SUBMIT_PROMPT_COPY = {
  title: "Submit a prompt",
  description: "Prompt a coding agent to build what you want to see in OpenConductor. If we like your prompt, we'll run it and merge the result.",
  promptLabel: "Prompt",
  promptPlaceholder: "Describe what you'd like to see built...",
  nameLabel: "Your name (if we use your prompt, we'll credit you in the changelog)",
  namePlaceholder: "Jane Doe",
  submit: "Submit prompt",
} as const;

/** `W5a`'s message body, then `V5a`'s version footer. */
export function promptSubmissionBody(prompt: string, name: string, appVersion: string, os: string): string {
  return `[PROMPT SUBMISSION]\n\nName: ${name.trim() || "(anonymous)"}\nPrompt:\n${prompt.trim()}\n\n----\nApp Version: ${appVersion}\nOS: ${os}`;
}

/** The new-issue URL the dialog opens; the title is the prompt's first line, shortened. */
export function promptSubmissionUrl(prompt: string, name: string, appVersion: string, os: string): string {
  const first = prompt.trim().split("\n")[0];
  const title = `Prompt: ${first.length > 72 ? `${first.slice(0, 71)}…` : first}`;
  const params = new URLSearchParams({ title, body: promptSubmissionBody(prompt, name, appVersion, os) });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
