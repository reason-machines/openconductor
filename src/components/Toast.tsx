import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "./Icons";
import { keepLeaving, TOAST_MS } from "./motion/presence.ts";
import { usePresence } from "./motion/usePresence.ts";
import { toastTimeout, type ToastAction, type ToastItem } from "./toastTiming";

export type { ToastAction, ToastItem };

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((kind: ToastItem["kind"], message: string, opts?: { sticky?: boolean; action?: ToastAction; secondaryAction?: ToastAction; description?: string; extraActions?: ToastAction[] }) => {
    setToasts((t) => [...t, { id: nextId++, kind, message, sticky: opts?.sticky, action: opts?.action, secondaryAction: opts?.secondaryAction, description: opts?.description, extraActions: opts?.extraActions }]);
  }, []);
  return { toasts, show, dismiss };
}

function Toast({ toast, leaving, onDismiss }: { toast: ToastItem; leaving: boolean; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const motion = usePresence(!leaving, TOAST_MS, { appear: true });
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
    <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} {...motion.attrs}>
      <span className="toast-message">
        {toast.message}
        {toast.description && <span className="toast-description">{toast.description}</span>}
      </span>
      {toast.action && (
        <button className="btn btn-small" onClick={() => { toast.action?.onClick(); onDismiss(); }}>{toast.action.label}</button>
      )}
      {toast.secondaryAction && (
        <button className="btn btn-small" onClick={() => { toast.secondaryAction?.onClick(); onDismiss(); }}>{toast.secondaryAction.label}</button>
      )}
      {toast.extraActions?.map((a) => (
        <button key={a.label} className="btn btn-small" onClick={a.onClick}>{a.label}</button>
      ))}
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
  // A dismissed toast stays rendered for its 400 ms exit (Conductor's toast leaves the way it came).
  const [shown, setShown] = useState<{ item: ToastItem; leaving: boolean }[]>(() => keepLeaving([], toasts, (t) => t.id));
  useEffect(() => setShown((s) => keepLeaving(s, toasts, (t) => t.id)), [toasts]);
  const leavingIds = shown.filter((s) => s.leaving).map((s) => s.item.id).join(",");
  useEffect(() => {
    if (!leavingIds) return;
    const gone = new Set(leavingIds.split(",").map(Number));
    const t = setTimeout(() => setShown((s) => s.filter((x) => !(x.leaving && gone.has(x.item.id)))), TOAST_MS);
    return () => clearTimeout(t);
  }, [leavingIds]);
  if (shown.length === 0) return null;
  return (
    <div className="toaster">
      {shown.map(({ item, leaving }) => (
        <Toast key={item.id} toast={item} leaving={leaving} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>
  );
}
