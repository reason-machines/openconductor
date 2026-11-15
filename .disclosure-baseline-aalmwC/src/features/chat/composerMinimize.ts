// The chat composer's one-line ("minimized") state, after Conductor 0.87.6
// (renderApp-D_fmY7hW.js: the hook `gTo` at ~8,651,401 and its use in the
// composer `ITo` at ~8,664,946). While a content tab (a file's diff or the PR)
// fills the main area, an empty composer shrinks to a single row: the agent
// icon, the placeholder, "⌘L to focus" and the send button. Focusing or
// clicking it expands it again; scrolling the content tab shrinks it back,
// but not within 500 ms of an expand.

/** Conductor's `mTo`: a scroll this soon after an expand does not minimize again. */
export const MINIMIZE_GRACE_MS = 500;

export interface MinimizeState {
  minimized: boolean;
  /** The last change animates (Conductor's `shouldAnimateResize`); a tab switch does not. */
  animate: boolean;
}

export interface MinimizeInputs {
  draft: string;
  hasAttachments: boolean;
  /** A permission or approval request is waiting (Conductor's pending approval `Ac`). */
  approvalWaiting: boolean;
  /** A plan waits for an answer (Conductor's `needs_plan_response`). */
  planWaiting: boolean;
}

/**
 * Conductor's `canMinimize`: an empty composer with nothing waiting on it.
 * Conductor also excludes its queue-edit composer; queued messages here are
 * edited in their row, never in this composer.
 */
export function canMinimize(i: MinimizeInputs): boolean {
  return i.draft.trim().length === 0 && !i.hasAttachments && !i.approvalWaiting && !i.planWaiting;
}

/**
 * Conductor's `Lm` (focusedInputId !== "composer-input" && no text or
 * attachments && model picker closed): the "⌘L to focus" hint shows. On the
 * full composer it is a badge at the top right; minimized it sits in the row.
 */
export function focusHintVisible({ focused, draft, hasAttachments, pickerOpen }: { focused: boolean; draft: string; hasAttachments: boolean; pickerOpen: boolean }): boolean {
  return !focused && draft.trim().length === 0 && !hasAttachments && !pickerOpen;
}

/** First render: minimized when a content tab is shown and the composer is empty, without animation. */
export function initialMinimize(viewingContent: boolean, can: boolean): MinimizeState {
  return { minimized: can && viewingContent, animate: false };
}

/** Switching to or from a content tab snaps to its state without animating (Conductor's layout effect). */
export function onViewChange(s: MinimizeState, viewingContent: boolean, can: boolean): MinimizeState {
  const minimized = viewingContent && can;
  return s.minimized === minimized && !s.animate ? s : { minimized, animate: false };
}

/** Text, an attachment or a waiting request expands it, animated (Conductor's `vTo`). */
export function onCanMinimizeChange(s: MinimizeState, can: boolean): MinimizeState {
  return can || !s.minimized ? s : { minimized: false, animate: true };
}

/** Focus or a click expands it, animated (Conductor's `_To`). */
export function expand(s: MinimizeState): MinimizeState {
  return s.minimized ? { minimized: false, animate: true } : s;
}

/** A scroll in the content tab minimizes it, animated (Conductor's `bTo`), when allowed. */
export function minimizeIfEmpty(s: MinimizeState, o: { viewingContent: boolean; can: boolean; now: number; expandedAt: number }): MinimizeState {
  if (!o.viewingContent || !o.can || o.now - o.expandedAt < MINIMIZE_GRACE_MS) return s;
  return s.minimized ? s : { minimized: true, animate: true };
}
