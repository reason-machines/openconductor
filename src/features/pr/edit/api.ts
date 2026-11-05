// Bridge to `pr_edit` and `pr_retarget` (src-tauri/src/pr/commands.rs).
// Outside Tauri (browser demo) the calls succeed without doing anything.
import { invoke, isTauri } from "@tauri-apps/api/core";

/** `gh pr edit <n> [--title] [--body]`; omitted fields stay as they are. */
export async function editPr(repoPath: string, number: number, edit: { title?: string; body?: string }): Promise<void> {
  if (!isTauri()) return;
  await invoke("pr_edit", { repoPath, number, title: edit.title ?? null, body: edit.body ?? null });
}

/** `gh pr edit <n> --base <base>`. */
export async function retargetPr(repoPath: string, number: number, base: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("pr_retarget", { repoPath, number, base });
}
