import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { ComposerAttachment } from "./composerAttachments.ts";
import "./composerAttachmentPreview.css";

interface Props {
  attachment: ComposerAttachment;
  editorEpoch: number;
  onRemove(): void;
}

type Preview = { kind: "closed" } | { kind: "open"; epoch: number; left: number; top: number };

export function ComposerAttachmentChip({ attachment, editorEpoch, onRemove }: Props) {
  const trigger = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<Preview>({ kind: "closed" });
  const label = attachment.label ?? attachment.name;
  const eligible = attachment.preview === "text";
  const open = preview.kind === "open" && preview.epoch === editorEpoch;

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  function close() {
    clearTimer();
    setPreview((current) => current.kind === "closed" ? current : { kind: "closed" });
  }
  function enter(event: PointerEvent) {
    clearTimer();
    if (event.pointerType === "touch" || !eligible || open) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPreview({ kind: "open", epoch: editorEpoch, left: rect.left, top: rect.top });
    }, 150);
  }
  function leave() {
    clearTimer();
    if (open) timer.current = setTimeout(close, 100);
  }

  useEffect(() => { close(); }, [editorEpoch, attachment.name, attachment.text, eligible]);
  useEffect(() => () => clearTimer(), []);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const card = popup.current.getBoundingClientRect();
    const left = Math.max(16, Math.min(anchor.left, window.innerWidth - card.width - 16));
    const top = Math.max(16, Math.min(anchor.top - card.height - 8, window.innerHeight - card.height - 16));
    setPreview((current) => current.kind === "closed" || current.left === left && current.top === top ? current : { ...current, left, top });
  }, [open]);

  return <>
    <span ref={trigger} className="chip composer-attachment" title={eligible ? undefined : attachment.staged ?? attachment.text} onPointerEnter={enter} onPointerLeave={leave}>
      {label}
      <button type="button" className="composer-attachment-remove" aria-label={`Remove ${label}`} onClick={onRemove}>×</button>
    </span>
    {open ? createPortal(
      <div ref={popup} className="oc-attachment-preview" role="region" aria-label="Text attachment preview" style={{ left: preview.left, top: preview.top }} onPointerEnter={clearTimer} onPointerLeave={leave}>
        <div className="oc-attachment-preview-title">{label}</div>
        <pre className="oc-attachment-preview-content">{attachment.text}</pre>
      </div>, document.body,
    ) : null}
  </>;
}
