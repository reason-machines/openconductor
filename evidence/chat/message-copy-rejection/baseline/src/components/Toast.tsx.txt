import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "./Icons";
import { toastTimeout, type ToastAction, type ToastItem } from "./toastTiming";
import { endingProps } from "./sidebarMotion";

export type { ToastAction, ToastItem };

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissals = useRef(new Map<number, () => void>());
  const dismiss = useCallback((id: number) => {
    const onDismiss = dismissals.current.get(id);
    dismissals.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
    onDismiss?.();
  }, []);
  const show = useCallback((kind: ToastItem["kind"], message: string, opts?: { sticky?: boolean; action?: ToastAction; secondaryAction?: ToastAction; description?: string; extraActions?: ToastAction[]; durationMs?: number; onDismiss?: () => void }) => {
    const id = nextId++;
    if (opts?.onDismiss) dismissals.current.set(id, opts.onDismiss);
    setToasts((t) => [...t, { id, kind, message, sticky: opts?.sticky, action: opts?.action, secondaryAction: opts?.secondaryAction, description: opts?.description, extraActions: opts?.extraActions, durationMs: opts?.durationMs }]);
  }, []);
  return { toasts, show, dismiss };
}

function Toast({ toast, leaving, onDismiss }: { toast: ToastItem; leaving: boolean; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  // The timer starts once per toast. The parent passes a new onDismiss on every
  // render, so it is read through a ref: as an effect dependency it restarted
  // the timer on each re-render, and a busy app kept an error toast up for good.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (leaving) return;
    const ms = toastTimeout(toast);
    if (ms === null) return;
    const t = setTimeout(() => dismissRef.current(), ms);
    return () => clearTimeout(t);
  }, [toast, leaving]);

  async function copy() {
    await navigator.clipboard?.writeText(toast.message).catch(() => undefined);
    setCopied(true);
  }

  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} {...endingProps(leaving)}>
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

/**
 * Conductor's toasts (`.conductor-toast`, renderApp-BYEcFwvt.css) slide in from
 * translateY(150%) at opacity 0 and leave the same way, `transition: transform .4s,
 * opacity .4s` (CSS default `ease`). A dismissed toast stays this long with
 * data-ending-style before it unmounts.
 */
export const TOAST_EXIT_MS = 400;

/** `toasts` plus the ones just removed, flagged as leaving, for TOAST_EXIT_MS. */
function useLeavingToasts(toasts: ToastItem[]): { toast: ToastItem; leaving: boolean }[] {
  const [leaving, setLeaving] = useState<ToastItem[]>([]);
  const [prev, setPrev] = useState(toasts);
  if (prev !== toasts) {
    const ids = new Set(toasts.map((t) => t.id));
    const gone = prev.filter((t) => !ids.has(t.id));
    setPrev(toasts);
    if (gone.length > 0) setLeaving((l) => [...l.filter((t) => !ids.has(t.id)), ...gone]);
  }
  useEffect(() => {
    if (leaving.length === 0) return;
    const ids = new Set(leaving.map((t) => t.id));
    const timer = setTimeout(() => setLeaving((l) => l.filter((t) => !ids.has(t.id))), TOAST_EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  // Ids grow in show order, so sorting by id keeps a leaving toast in its place while it slides out.
  return [...toasts.map((toast) => ({ toast, leaving: false })), ...leaving.map((toast) => ({ toast, leaving: true }))].sort((a, b) => a.toast.id - b.toast.id);
}

export function Toaster({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  const shown = useLeavingToasts(toasts);
  if (shown.length === 0) return null;
  return (
    <div className="toaster">
      {shown.map(({ toast: t, leaving }) => (
        <Toast key={t.id} toast={t} leaving={leaving} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
