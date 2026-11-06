// The turn footer's "Show message actions" menu, as Conductor 0.87.6 builds it
// (renderApp-D_fmY7hW.js `TDo` @8,918,9xx-8,926,4xx, read as data):
//
//   trigger  aria-label "Show message actions", tooltip "More actions", lucide
//            `ellipsis` at 14px in a 20px ghost button (`size-5`, `rounded-sm`),
//            accent while open; after the "Copy final message" button.
//   popup    DropdownMenuContent `Tm`, align "start" (side bottom, sideOffset 4,
//            flip / shift on collision).
//   items    in this order, each with a 14px lucide icon and `gap-2`:
//            "Fork to new tab"        message-square-plus, when the chat has a session
//                                     and the workspace is not archived (`ae`);
//            "Fork to new workspace"  split, the same and the workspace is on this
//                                     machine (`pe`);
//            "Reset chat"             undo-2, a workspace with a path, not archived, not
//                                     the last turn, and the turn has something to reset
//                                     to (`ue`).
//            Both forks are disabled while either fork is being made (`he`); Reset chat
//            while the agent works or waits on a plan response.
//   The trigger only shows when at least one item does (`be`).

export type TurnMenuItemId = "fork-tab" | "fork-workspace" | "reset-chat";

export interface TurnMenuItem {
  id: TurnMenuItemId;
  label: string;
  /** Lucide icon name Conductor draws before the label. */
  icon: "message-square-plus" | "split" | "undo-2";
  disabled: boolean;
}

export interface TurnMenuInput {
  /** "Fork to new tab" is offered for this chat. */
  canForkToTab: boolean;
  /** "Fork to new workspace" is offered (a workspace on this machine). */
  canForkToWorkspace: boolean;
  /** "Reset chat" is offered for this turn. */
  canReset: boolean;
  /** A fork is being made. */
  forkPending: boolean;
  /** The agent is working or waits on a plan response. */
  resetBlocked: boolean;
}

export const TURN_MENU_TRIGGER_LABEL = "Show message actions";
export const TURN_MENU_TOOLTIP = "More actions";

/** The menu's items in Conductor's order; empty when the trigger is not shown. */
export function turnMenuItems(input: TurnMenuInput): TurnMenuItem[] {
  const items: TurnMenuItem[] = [];
  if (input.canForkToTab) items.push({ id: "fork-tab", label: "Fork to new tab", icon: "message-square-plus", disabled: input.forkPending });
  if (input.canForkToWorkspace) items.push({ id: "fork-workspace", label: "Fork to new workspace", icon: "split", disabled: input.forkPending });
  if (input.canReset) items.push({ id: "reset-chat", label: "Reset chat", icon: "undo-2", disabled: input.resetBlocked });
  return items;
}
