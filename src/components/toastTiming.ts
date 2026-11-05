export interface ToastItem {
  id: number;
  kind: "error" | "info";
  message: string;
  /** Stays until dismissed (Conductor's `duration: Infinity` workspace errors). */
  sticky?: boolean;
  /** A button beside the message, such as "Open in GitHub". */
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** How long a toast stays before it dismisses itself; `null` means until dismissed. */
export function toastTimeout(toast: Pick<ToastItem, "kind" | "sticky">): number | null {
  if (toast.sticky) return null;
  return toast.kind === "error" ? 8000 : 4000;
}
