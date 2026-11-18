// Actions previews use the same prompt builders as their normal consumers.
// Placeholder context is illustrative; preview never reads a checkout or runs an action.
import { invoke } from "@tauri-apps/api/core";
import { buildReviewPrompt } from "../features/diff/review.ts";
import { fixErrorsInstructions } from "../features/pr/checks/fixErrors.ts";
import { withRenameBranch } from "./prompts.ts";
import type { PromptKind } from "./types.ts";

export async function actionPromptPreview(kind: PromptKind, draft: string): Promise<string> {
  switch (kind) {
    case "code_review":
      return buildReviewPrompt({ remote: "origin", targetBranch: "${TARGET_BRANCH}", custom: draft });
    case "fix_errors":
      return fixErrorsInstructions(draft);
    case "rename_branch":
      // OpenConductor applies this preference to the first chat message.
      return withRenameBranch("${YOUR_MESSAGE}", draft);
    case "create_pr":
    case "resolve_merge_conflicts":
      return invoke<string>("pr_action_prompt_preview", { kind, custom: draft });
    case "general":
      return "";
  }
}
