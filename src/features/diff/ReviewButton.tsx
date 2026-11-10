// parity:pr.ai-review:ui
// The right panel's Review button and the review chats it opens. As in
// Conductor (evidence/pr/ai-review.md): the button sits at the right of the
// panel's tab strip while the workspace has changes; a click opens a new chat
// tab on the review model and sends the review request with the instructions
// attached as "Review request.md"; "Edit before sending" (right-click) opens
// the tab with the request in the composer instead. ⌘⇧R does the same as a
// click. Review tabs live until closed; an open one is stored in conductor.db
// and comes back after a restart, as Conductor's review chat (a `sessions`
// row) does (state/openChat.ts). Their Reason Sessions stay in Reason.
import { useCallback, useEffect, useState } from "react";
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { ContextMenu, MenuItem } from "../../components/menu/ContextMenu";
import { getSettings } from "../../settings/api";
import { DEFAULT_SETTINGS } from "../../settings/types";
import type { Repo, Workspace } from "../../state/types";
import { configureReason, configureReasonDefault } from "../chat/reasonChat.ts";
import { CHAT_ID_SEGMENT, NEW_CHAT_TITLE, newChatId } from "../chat/chatTabs.ts";
import { hideChat, showChat } from "../chat/chatRuntime.ts";
import type { PromptAttachment } from "../chat/reason.ts";
import { buildReviewPrompt, type ConfigChoice, REVIEW_ATTACHMENT, REVIEW_MESSAGE, reviewDraft, reviewModel, reviewTabTitle } from "./review.ts";
import { repoReviewPrompt } from "./reviewApi.ts";
import { repoSettingsEffective } from "../../settings/repoSettings.ts";
import { chatTabWrites, restoredChatTabs, setOpenReviewChats } from "../../state/openChat.ts";
import { inTauri } from "../../backend.ts";
import { invoke } from "@tauri-apps/api/core";
import { initializeLoadoutChoice } from "../chat/chatModelChoice.ts";
import { loadoutSlots, parseFavorites } from "../../settings/agents/loadout.ts";
import { listFavorites } from "../../settings/agents/api";
import { sessionConfig } from "../chat/chatModel.ts";

export interface ReviewTab {
  chatId: string;
  title: string;
  /** A chat forked from another ("Fork to new tab"), not a review. */
  fork?: true;
  /** A new chat opened with "+" or ⌘T, not a review. */
  blank?: true;
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

/** The workspace's tabs in this window, else the ones open when the app last ran. */
function currentTabs(workspaceId: string): ReviewTab[] {
  return (
    tabsByWorkspace.get(workspaceId) ??
    restoredChatTabs(workspaceId).map((t) => ({ chatId: t.id, title: t.title, ...(t.id.includes(CHAT_ID_SEGMENT) ? { blank: true as const } : {}), modelLabel: "", effort: null }))
  );
}

/** Review chats of a workspace. `onOpen` shows a chat once it is created. */
export function useReviewChats(repo: Repo, workspace: Workspace, onOpen: (chatId: string) => void) {
  const [tabs, setTabs] = useState<ReviewTab[]>(() => currentTabs(workspace.id));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTabs(currentTabs(workspace.id));
    setError(null);
  }, [workspace.id]);

  const save = useCallback(
    (next: ReviewTab[]) => {
      // Open tabs are stored so they, and their unread, survive a restart.
      if (inTauri()) {
        for (const w of chatTabWrites(workspace.id, currentTabs(workspace.id), next)) {
          invoke(w.command, w.args).catch((err) => console.error(`conductor.db: ${w.command} failed`, err));
        }
      }
      tabsByWorkspace.set(workspace.id, next);
      // Unread and Go to next unread count a review chat only while its tab is open.
      setOpenReviewChats(workspace.id, next.map((t) => t.chatId));
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
        const current = currentTabs(workspace.id);
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
      save(currentTabs(workspace.id).filter((t) => t.chatId !== chatId));
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
      save([...currentTabs(workspace.id), { chatId, title, fork: true, modelLabel: "", effort: null }]);
      onOpen(chatId);
      return chatId;
    },
    [workspace.id, save, onOpen],
  );

  /**
   * "+" and ⌘T ("New chat, same files"): a new Untitled chat in this
   * workspace on the default model, shown once created. Returns its chat id.
   */
  const newChat = useCallback(async (): Promise<string | undefined> => {
    try {
      const [settings, rows] = await Promise.all([getSettings(), listFavorites().catch(() => [])]);
      const chatId = newChatId(workspace.id, Date.now(), ++seq);
      const choice = initializeLoadoutChoice(chatId, loadoutSlots(settings, parseFavorites(rows)));
      configureReasonDefault(chatId, Promise.resolve(sessionConfig(choice.model, choice.effort)));
      save([...currentTabs(workspace.id), { chatId, title: NEW_CHAT_TITLE, blank: true, modelLabel: "", effort: null }]);
      onOpen(chatId);
      return chatId;
    } catch (e) {
      setError(`Failed to create chat: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [workspace.id, save, onOpen]);

  /** ⌘⇧T: put a closed chat tab back at the end of the strip and show it. */
  const reopen = useCallback(
    (tab: ReviewTab) => {
      showChat(tab.chatId);
      save([...currentTabs(workspace.id).filter((t) => t.chatId !== tab.chatId), tab]);
      onOpen(tab.chatId);
    },
    [workspace.id, save, onOpen],
  );

  /** "Rename chat" on a review, fork or "+" tab. */
  const rename = useCallback(
    (chatId: string, title: string) => {
      save(currentTabs(workspace.id).map((t) => (t.chatId === chatId ? { ...t, title } : t)));
    },
    [workspace.id, save],
  );

  return { tabs, start, close, fork, newChat, reopen, rename, error };
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  return (
    <span className="review-action">
      {error && (
        <span className="error" title={error}>
          Review failed
        </span>
      )}
      <Tooltip content="Get an AI code review" shortcut="workspace.showReview">
        <button
          className="btn btn-small review-button"
          onClick={onReview}
          disabled={disabled}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <ReviewIcon /> Review
        </button>
      </Tooltip>
      {menu && (
        // ContextMenu flips and shifts it inside the window (the button sits at the right edge).
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
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
