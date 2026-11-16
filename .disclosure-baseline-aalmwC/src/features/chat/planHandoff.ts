import type { ComposerAttachment } from "./composerAttachments.ts";

interface PlanHandoff {
  plan: string;
  attachmentPath: string;
  isPending(): boolean;
  stage(attachment: ComposerAttachment): Promise<void>;
  openDraft(draft: { text: string; attachments: ComposerAttachment[] }): void;
  reject(): Promise<void>;
  stop(): void;
}

export async function handoffPlan({ plan, attachmentPath, isPending, stage, openDraft, reject, stop }: PlanHandoff): Promise<void> {
  if (!plan.trim()) throw new Error("The agent sent no plan text.");
  const checkPending = () => {
    if (!isPending()) throw new Error("This plan request is no longer pending.");
  };
  checkPending();
  const attachment: ComposerAttachment = { name: attachmentPath, label: "plan.md", text: plan, staged: attachmentPath };
  await stage(attachment);
  checkPending();
  openDraft({ text: "", attachments: [attachment] });
  await reject();
  stop();
}
