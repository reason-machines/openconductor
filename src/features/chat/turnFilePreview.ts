import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadWorkspaceDiff } from "../diff/api.ts";
import type { TurnRef } from "../diff/turnChangesCache.ts";
import type { FileChange, FileDiff } from "../diff/types.ts";
import { baseName } from "./conductorTools.ts";
import { FileGlyph } from "./ToolRows.tsx";
import "./turnFilePreview.css";

type Position = { left: number; top: number };
type Preview = { kind: "closed" } | ({ at: Position } & (
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "binary" }
  | { kind: "text"; file: FileDiff }
));

interface Props {
  file: FileChange;
  turn: TurnRef;
  worktree: string | null;
  onOpenFile: (path: string) => void;
  children: ReactNode;
}

function contents(preview: Preview): ReactNode {
  switch (preview.kind) {
    case "closed": return null;
    case "loading": return h("div", { className: "chat-file-preview-message", role: "status" }, "Loading…");
    case "missing": return h("div", { className: "chat-file-preview-message" }, "No diff available");
    case "binary": return h("div", { className: "chat-file-preview-message" }, "Binary file changed");
    case "text": return h("div", { className: "chat-file-preview-diff" }, preview.file.hunks.map((hunk, index) =>
      h("div", { key: index },
        h("div", { className: "chat-file-preview-hunk" }, `@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@ ${hunk.section}`),
        hunk.lines.map((line, row) => h("div", { key: row, className: "chat-file-preview-line", "data-kind": line.kind },
          h("span", { className: "chat-file-preview-number", "aria-hidden": true }, line.old_line ?? ""),
          h("span", { className: "chat-file-preview-number", "aria-hidden": true }, line.new_line ?? ""),
          h("span", { className: "chat-file-preview-sign", "aria-hidden": true }, line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : " "),
          h("span", { className: "chat-file-preview-text" }, line.text),
        )),
      ),
    ));
  }
}

/** Footer-local badge: the caller keys it by its complete historical target. */
export function TurnFilePreview({ file, turn, worktree, onOpenFile, children }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<Preview>({ kind: "closed" });
  const open = preview.kind !== "closed";
  const eligible = file.additions + file.deletions <= 500;
  const { sessionId, turnId } = turn;
  const path = file.path;

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  function close() {
    clearTimer();
    setPreview({ kind: "closed" });
  }
  function enter() {
    clearTimer();
    if (!eligible || open) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPreview({ kind: "loading", at: { left: rect.left, top: rect.top } });
    }, 150);
  }
  function leave() {
    clearTimer();
    if (open) timer.current = setTimeout(close, 100);
  }

  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void loadWorkspaceDiff(worktree, { branch: "main", remote: "origin" }, {
      scope: "all", layout: "unified", ignoreWhitespace: false, wrapLines: false,
    }, { path, turn: { sessionId, turnId } }).then((files) => {
      if (!current) return;
      const selected = files.find((candidate) => candidate.path === path);
      setPreview((state) => {
        if (state.kind === "closed") return state;
        if (!selected) return { kind: "missing", at: state.at };
        if (selected.binary) return { kind: "binary", at: state.at };
        if (!selected.hunks.some((hunk) => hunk.lines.length > 0)) return { kind: "missing", at: state.at };
        return { kind: "text", at: state.at, file: selected };
      });
    }, () => {
      if (current) setPreview((state) => state.kind === "closed" ? state : { kind: "missing", at: state.at });
    });
    return () => { current = false; };
  }, [open, worktree, sessionId, turnId, path]);

  useLayoutEffect(() => {
    if (preview.kind === "closed" || !trigger.current || !card.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const popup = card.current.getBoundingClientRect();
    const left = Math.max(16, Math.min(anchor.left, window.innerWidth - popup.width - 16));
    const top = Math.max(16, Math.min(anchor.top - popup.height - 8, window.innerHeight - popup.height - 16));
    setPreview((state) => state.kind === "closed" || state.at.left === left && state.at.top === top ? state : { ...state, at: { left, top } });
  }, [preview.kind]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && card.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  return h(Fragment, null,
    h("button", {
      ref: trigger, type: "button", className: "oc-file-badge filebadge chat-turn-chip",
      title: eligible ? undefined : "Open to view preview",
      onClick: (event) => { event.stopPropagation(); onOpenFile(path); },
      onPointerEnter: (event) => { if (event.pointerType !== "touch") enter(); },
      onPointerLeave: leave,
    }, h(FileGlyph, { path }), h("span", { className: "oc-file-badge-name" }, baseName(path)), children),
    preview.kind === "closed" ? null : createPortal(h("div", {
      ref: card, className: "chat-file-preview", role: "region", "aria-label": "File change preview",
      style: { left: preview.at.left, top: preview.at.top },
      onPointerEnter: clearTimer, onPointerLeave: leave,
    },
    h("div", { className: "chat-file-preview-header" }, h(FileGlyph, { path }),
      h("span", null, worktree && path.startsWith(`${worktree}/`) ? path.slice(worktree.length + 1) : path)),
    h("div", { className: "chat-file-preview-body" }, contents(preview))), document.body),
  );
}
