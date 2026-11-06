export interface ToastItem {
  id: number;
  kind: "error" | "info";
  message: string;
  /** Stays until dismissed (Conductor's `duration: Infinity` workspace errors). */
  sticky?: boolean;
  /** Its own lifetime in ms, like Conductor's `duration: 15e3` Xcode license toast. */
  durationMs?: number;
  /** A button beside the message, such as "Open in GitHub". */
  action?: ToastAction;
  /** A second button after `action`, such as "Unarchive". */
  secondaryAction?: ToastAction;
  /** A line under the message. */
  description?: string;
  /** More buttons after those; they leave the toast open ("Open in Finder", "Copy path"). */
  extraActions?: ToastAction[];
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** How long a toast stays before it dismisses itself; `null` means until dismissed. */
export function toastTimeout(toast: Pick<ToastItem, "kind" | "sticky" | "durationMs">): number | null {
  if (toast.sticky) return null;
  if (toast.durationMs !== undefined) return toast.durationMs;
  return toast.kind === "error" ? 8000 : 4000;
}
