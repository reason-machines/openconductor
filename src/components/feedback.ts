import { FEEDBACK_URL } from "./helpMenuItems.ts";

export const FEEDBACK_DIALOG_ID = "feedback-dialog";

export const FEEDBACK_COPY = {
  title: "Feedback",
  description: "Tell us about your experience, bugs you\u0027ve found, or features you\u0027d like to see.",
  messageLabel: "Message",
  placeholder: "Tell us about your experience, bugs you\u0027ve found, or features you\u0027d like to see...",
  privacy: "Continue to a public GitHub issue draft. Review it before posting. Screenshots, app logs and account details are not attached.",
  submit: "Continue on GitHub",
  opening: "Opening GitHub...",
  openError: "Could not open GitHub. Your feedback is still here. Please try again.",
} as const;

type Draft = { message: string; appVersion?: string; platform?: string };

export type FeedbackDraftResult =
  | { kind: "empty" }
  | { kind: "opened" }
  | { kind: "error"; message: string };

export function feedbackDraftUrl({ message, appVersion, platform }: Draft): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split(/\r?\n/)[0];
  const title = `Feedback: ${firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine}`;
  const body = `${trimmed}\n\n----\nApp Version: ${appVersion ?? "unknown"}\nOS: ${platform ?? "unknown"}`;
  return `${FEEDBACK_URL}?${new URLSearchParams({ title, body }).toString()}`;
}

export async function openFeedbackDraft({ openUrl, ...draft }: Draft & { openUrl: (url: string) => Promise<unknown> }): Promise<FeedbackDraftResult> {
  const url = feedbackDraftUrl(draft);
  if (url === null) return { kind: "empty" };
  try {
    await openUrl(url);
    return { kind: "opened" };
  } catch {
    return { kind: "error", message: FEEDBACK_COPY.openError };
  }
}
