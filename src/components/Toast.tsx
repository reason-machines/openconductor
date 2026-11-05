import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "./Icons";
import { toastTimeout, type ToastAction, type ToastItem } from "./toastTiming";

export type { ToastAction, ToastItem };

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((kind: ToastItem["kind"], message: string, opts?: { sticky?: boolean; action?: ToastAction; secondaryAction?: ToastAction }) => {
    setToasts((t) => [...t, { id: nextId++, kind, message, sticky: opts?.sticky, action: opts?.action, secondaryAction: opts?.secondaryAction }]);
  }, []);
  return { toasts, show, dismiss };
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const ms = toastTimeout(toast);
    if (ms === null) return;
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  async function copy() {
    await navigator.clipboard?.writeText(toast.message).catch(() => undefined);
    setCopied(true);
  }

  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button className="btn btn-small" onClick={() => { toast.action?.onClick(); onDismiss(); }}>{toast.action.label}</button>
      )}
      {toast.secondaryAction && (
        <button className="btn btn-small" onClick={() => { toast.secondaryAction?.onClick(); onDismiss(); }}>{toast.secondaryAction.label}</button>
      )}
      {toast.kind === "error" && (
        <button className="btn btn-small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      )}
      <button className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

export function Toaster({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
