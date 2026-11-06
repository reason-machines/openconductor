// parity:pr.ai-review:ui
// The right panel's Review button and the review chats it opens. As in
// Conductor (evidence/pr/ai-review.md): the button sits at the right of the
// panel's tab strip while the workspace has changes; a click opens a new chat
// tab on the review model and sends the review request with the instructions
// attached as "Review request.md"; "Edit before sending" (right-click) opens
// the tab with the request in the composer instead. ⌘⇧R does the same as a
// click. Review tabs live until closed or the app quits; their Reason
// Sessions stay in Reason.
import { useCallback, useEffect, useState } from "react";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { ContextMenu, MenuItem } from "../../components/ContextMenu";
import { getSettings } from "../../settings/api";
import { DEFAULT_SETTINGS } from "../../settings/types";
import type { Repo, Workspace } from "../../state/types";
import { configureReason } from "../chat/reasonChat.ts";
import { hideChat } from "../chat/chatRuntime.ts";
import type { PromptAttachment } from "../chat/reason.ts";
import { buildReviewPrompt, type ConfigChoice, REVIEW_ATTACHMENT, REVIEW_MESSAGE, reviewDraft, reviewModel, reviewTabTitle } from "./review.ts";
import { repoReviewPrompt } from "./reviewApi.ts";
import { repoSettingsEffective } from "../../settings/repoSettings.ts";

export interface ReviewTab {
  chatId: string;
  title: string;
  /** A chat forked from another ("Fork to new tab"), not a review. */
  fork?: true;
  /** Readable review model, shown in the chat. */
  modelLabel: string;
  effort: string | null;
}

/** What a chat does when it next shows: send a message, or put it in the composer. */
export type PendingMessage = { kind: "send"; text: string; attachments: PromptAttachment[] } | { kind: "draft"; text: string; attachments?: PromptAttachment[] };

const tabsByWorkspace = new Map<string, ReviewTab[]>();
const pending = new Map<string, PendingMessage>();
let seq = 0;

/** Queue a message for a chat that is not shown; it acts on it when it shows. */
export function queuePending(chatId: string, p: PendingMessage): void {
  pending.set(chatId, p);
}

/** The request a chat has not acted on yet; taken once. */
export function takePendingMessage(chatId: string): PendingMessage | undefined {
  const p = pending.get(chatId);
  pending.delete(chatId);
  return p;
}

/** Review chats of a workspace. `onOpen` shows a chat once it is created. */
export function useReviewChats(repo: Repo, workspace: Workspace, onOpen: (chatId: string) => void) {
  const [tabs, setTabs] = useState<ReviewTab[]>(() => tabsByWorkspace.get(workspace.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTabs(tabsByWorkspace.get(workspace.id) ?? []);
    setError(null);
  }, [workspace.id]);

  const save = useCallback(
    (next: ReviewTab[]) => {
      tabsByWorkspace.set(workspace.id, next);
      setTabs(next);
    },
    [workspace.id],
  );

  const start = useCallback(
    async (editBeforeSending = false) => {
      setError(null);
      try {
        const [settings, custom] = await Promise.all([getSettings().catch(() => DEFAULT_SETTINGS), reviewPreferences(repo.id, repo.path, workspace.path)]);
        const prompt = buildReviewPrompt({ remote: "origin", targetBranch: repo.defaultBranch, custom });
        const model = reviewModel(settings);
        const chatId = `${workspace.id}:review:${Date.now().toString(36)}-${++seq}`;
        configureReason(chatId, model.config);
        pending.set(
          chatId,
          editBeforeSending ? { kind: "draft", text: reviewDraft(prompt) } : { kind: "send", text: REVIEW_MESSAGE, attachments: [{ name: REVIEW_ATTACHMENT, text: prompt }] },
        );
        const current = tabsByWorkspace.get(workspace.id) ?? [];
        save([...current, { chatId, title: reviewTabTitle(current.length + 1), modelLabel: model.label, effort: model.effort }]);
        onOpen(chatId);
      } catch (e) {
        setError(`Failed to start review: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [repo.id, repo.path, repo.defaultBranch, workspace.id, workspace.path, save, onOpen],
  );

  const close = useCallback(
    (chatId: string) => {
      // A closed review no longer counts toward the workspace's sidebar status (Conductor folds visible sessions only).
      hideChat(chatId);
      save((tabsByWorkspace.get(workspace.id) ?? []).filter((t) => t.chatId !== chatId));
    },
    [workspace.id, save],
  );

  /**
   * "Fork to new tab": a new chat tab on the source chat's options whose
   * composer holds `draft` (the transcript attachment and the source's draft).
   * Opens it when created.
   */
  const fork = useCallback(
    (title: string, config: ConfigChoice[], draft: { text: string; attachments: PromptAttachment[] }): string => {
      const chatId = `${workspace.id}:review:${Date.now().toString(36)}-${++seq}`;
      configureReason(chatId, config);
      pending.set(chatId, { kind: "draft", ...draft });
      save([...(tabsByWorkspace.get(workspace.id) ?? []), { chatId, title, fork: true, modelLabel: "", effort: null }]);
      onOpen(chatId);
      return chatId;
    },
    [workspace.id, save, onOpen],
  );

  return { tabs, start, close, fork, error };
}

/**
 * The review instructions' repository preferences: the effective
 * `prompts.code_review` (user, then repository settings files), else the
 * repository's `custom_prompt_code_review` in conductor.db.
 */
async function reviewPreferences(repoId: string, repoPath: string, workspacePath: string | undefined): Promise<string | null> {
  if (repoPath) {
    try {
      const fromSettings = (await repoSettingsEffective(repoPath, workspacePath)).prompts.code_review?.value;
      if (fromSettings?.trim()) return fromSettings;
    } catch (e) {
      console.warn("review: settings prompt not read", e);
    }
  }
  return repoReviewPrompt(repoId);
}

/**
 * The Review button; right-click opens Conductor's one-item menu (`u6s`):
 * "Edit before sending", disabled like the button in a read-only workspace.
 */
export function ReviewButton({ onReview, onEdit, error, disabled }: { onReview: () => void; onEdit: () => void; error: string | null; disabled?: boolean }) {
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("workspace.showReview", overrides)[0];
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  return (
    <span className="review-action">
      {error && (
        <span className="error" title={error}>
          Review failed
        </span>
      )}
      <button
        className="btn btn-small review-button"
        onClick={onReview}
        disabled={disabled}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={`Get an AI code review${key ? ` (${glyphs(key)})` : ""}. Right-click to edit the request first.`}
      >
        <ReviewIcon /> Review
      </button>
      {menu && (
        <ContextMenu at={menu} label="Review actions" onClose={closeMenu}>
          <MenuItem disabled={disabled} onSelect={onEdit}>
            Edit before sending
          </MenuItem>
        </ContextMenu>
      )}
    </span>
  );
}

function ReviewIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}
