// The permission cards' pure parts: the question a tool card asks, its
// buttons, and the answers a questions card sends. `permissionPrompts.test.ts`
// covers them without React.
//
// Conductor 0.87.6 (REA-read renderApp chunk; evidence/chat-status/README.md):
// the tool card is `Jpo` (heading from `Xpo`), the questions card `H8i`.

import type { PermissionOption, Question, ToolPrompt } from "./chatRuntime.ts";
import { conductorTools, type ConductorTool } from "./conductorTools.ts";

/** ACP tool kinds; any other `tool` on a request is the provider's tool name (Claude Code's `Bash`). */
const ACP_KINDS = new Set(["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "switch_mode", "other"]);

/**
 * The tool call the card draws with the transcript's row (Conductor's `Jpo`
 * renders its approval's `{name: toolName, input: toolInput}` with `hIt`, the
 * transcript's tool row). A Reason request carries the ACP kind and raw input,
 * mapped the way its transcript rows are (conductorTools.ts `fromReason`).
 * Undefined when the request names no tool: the card then says "Approve this
 * tool request to continue".
 */
export function permissionTool(p: Pick<ToolPrompt, "tool" | "title" | "input">): ConductorTool | undefined {
  if (!p.tool && !p.title) return undefined;
  if (!p.tool || ACP_KINDS.has(p.tool)) {
    return conductorTools(p.title || p.tool, { kind: p.tool || "other", paths: [], title: p.title, ...(p.input !== null && p.input !== undefined ? { rawInput: p.input } : {}) })[0];
  }
  return conductorTools(p.tool, p.input ?? {})[0];
}

/** The card's question for a tool (Conductor's `Xpo`); ACP tool kinds map to the same lines. */
export function permissionHeading(tool: string): string {
  switch (tool) {
    case "Bash":
    case "BashOutput":
    case "execute":
      return "Do you want to run this command?";
    case "mcp__conductor__RunLocalCommand":
      return "Do you want to run this command on your Mac?";
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
