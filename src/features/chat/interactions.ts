// What a chat's agent is waiting on the user for, and the session status it
// gives the chat. Pure: `interactions.test.ts` covers it without Tauri or React.
//
// Conductor 0.87.6 (REA-read index chunk, frontend RPC methods TOOL_APPROVAL,
// EXIT_PLAN_MODE and ASK_USER_QUESTION; evidence/chat-status/README.md) sets a
// session to `needs_user_permission`, `needs_plan_response` or
// `needs_user_input` while one of these waits and back to `working` once it is
// answered; Stop clears them. The backend sends each as an `interaction` event
// (src-tauri/src/reason_acp/interaction.rs) and drops it with
// `interactionResolved`; the chat keeps the waiting ones in arrival order.

import { aggregateSessions, type SessionStatus } from "../../state/rowStatus.ts";
import type { SessionStatus as QueueStatus } from "./queue.ts";

export interface PermissionOption {
  id: string;
  label: string;
  /** ACP's option kinds: `allow_once`, `allow_always`, `reject_once`, `reject_always`. */
  kind: string;
}

export interface QuestionOption {
  label: string;
  description: string | null;
}

export interface Question {
  header: string;
  question: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export type InteractionRequest =
  | { kind: "permission"; tool: string; title: string; input: unknown; options: PermissionOption[] }
  | { kind: "plan"; plan: string }
  | { kind: "question"; questions: Question[] };

export interface Interaction {
  id: string;
  request: InteractionRequest;
}

/** The answer sent back (`reason_respond` / `claude_respond`). */
export type InteractionAnswer =
  | { kind: "option"; optionId: string }
  | { kind: "plan"; approved: boolean; feedback?: string }
  | { kind: "answers"; answers: string[][] }
  | { kind: "cancel" };

const STATUS: Record<InteractionRequest["kind"], SessionStatus> = {
  plan: "needs_plan_response",
  permission: "needs_user_permission",
  question: "needs_user_input",
};

/** Adds a waiting interaction; one with the same id is replaced in place. */
export function addInteraction(list: readonly Interaction[], i: Interaction): Interaction[] {
  return list.some((x) => x.id === i.id) ? list.map((x) => (x.id === i.id ? i : x)) : [...list, i];
}

export function resolveInteraction(list: readonly Interaction[], id: string): Interaction[] {
  return list.filter((x) => x.id !== id);
}

/**
 * The chat's session status (Conductor's `sessions.status`): cancelling while
 * a Stop is pending, else the most urgent waiting interaction, else the
 * queue's turn status.
 */
export function chatSessionStatus(queue: QueueStatus, waiting: readonly Interaction[]): SessionStatus {
  if (queue === "cancelling" || waiting.length === 0) return queue;
  return aggregateSessions(waiting.map((i) => STATUS[i.request.kind]));
}

/** The card's question for a tool (Conductor's `Xpo`); ACP tool kinds map to the same lines. */
export function permissionHeading(tool: string): string {
  switch (tool) {
    case "Bash":
    case "BashOutput":
    case "execute":
      return "Do you want to run this command?";
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
    case "edit":
    case "delete":
    case "move":
      return "Do you want to make these changes?";
    case "Task":
    case "Agent":
    case "sub-agent":
      return "Do you want to run this agent?";
    case "WebSearch":
      return "Do you want to do this search?";
    case "WebFetch":
    case "fetch":
      return "Do you want to fetch this page?";
    default:
      return "Do you want to run this tool?";
  }
}

export interface PermissionButtons {
  /** "Yes" (`chat.approveToolCall`). */
  allow?: PermissionOption;
  /** The alternate approval (`chat.autoAcceptToolCall`), e.g. "Always allow". */
  alternate?: PermissionOption;
  /** Any other options, shown between the alternate and "No". */
  others: PermissionOption[];
  /** "No" (`chat.denyToolCall`). */
  deny?: PermissionOption;
}

/**
 * The card's buttons in Conductor's order (`Jpo`): Yes, the alternate
 * approval, other options, No.
 */
export function permissionButtons(options: readonly PermissionOption[]): PermissionButtons {
  const allow = options.find((o) => o.kind === "allow_once") ?? options.find((o) => o.kind.startsWith("allow"));
  const alternate = options.find((o) => o !== allow && o.kind.startsWith("allow"));
  const deny = options.find((o) => o.kind === "reject_once") ?? options.find((o) => o.kind.startsWith("reject"));
  const others = options.filter((o) => o !== allow && o !== alternate && o !== deny);
  return { allow, alternate, others, deny };
}

/** One question's answer while the card is open: chosen labels and the typed "Other" answer. */
export interface QuestionDraft {
  chosen: string[];
  other: string;
}

export const emptyDrafts = (questions: readonly Question[]): QuestionDraft[] => questions.map(() => ({ chosen: [], other: "" }));

/** Picks an option: a single-select question keeps only it; a multi-select toggles it. */
export function chooseOption(q: Question, d: QuestionDraft, label: string): QuestionDraft {
  if (!q.multiSelect) return { chosen: [label], other: "" };
  const chosen = d.chosen.includes(label) ? d.chosen.filter((l) => l !== label) : [...d.chosen, label];
  return { ...d, chosen };
}

/** Typing an "Other" answer replaces a single-select choice. */
export function typeOther(q: Question, d: QuestionDraft, other: string): QuestionDraft {
  return { chosen: q.multiSelect || other.trim() === "" ? d.chosen : [], other };
}

export const isAnswered = (d: QuestionDraft): boolean => d.chosen.length > 0 || d.other.trim() !== "";

/** Submit is enabled once any question is answered (Conductor's `canSubmit`). */
export const canSubmit = (drafts: readonly QuestionDraft[]): boolean => drafts.some(isAnswered);

/** The answers sent back: per question, the chosen labels then the typed answer. */
export function questionAnswers(drafts: readonly QuestionDraft[]): string[][] {
  return drafts.map((d) => [...d.chosen, ...(d.other.trim() ? [d.other.trim()] : [])]);
}
