// The repository's code review prompt (`custom_prompt_code_review`), read
// from conductor.db by `db_repo_prompt`. The browser preview has none.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";

export async function repoReviewPrompt(repoId: string): Promise<string | null> {
  if (!inTauri()) return null;
  try {
    return await invoke<string | null>("db_repo_prompt", { repoId, prompt: "codeReview" });
  } catch (e) {
    // A repository not in conductor.db yet has no prompt; the review still runs.
    console.warn("review: no repository prompt", e);
    return null;
  }
}
