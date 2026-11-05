import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "./Icons";

export interface ToastItem {
  id: number;
  kind: "error" | "info";
  message: string;
}

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((kind: ToastItem["kind"], message: string) => {
    setToasts((t) => [...t, { id: nextId++, kind, message }]);
  }, []);
  return { toasts, show, dismiss };
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setTimeout(onDismiss, toast.kind === "error" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  async function copy() {
    await navigator.clipboard?.writeText(toast.message).catch(() => undefined);
    setCopied(true);
  }

  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
      <span className="toast-message">{toast.message}</span>
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
