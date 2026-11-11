import { cloneElement, useEffect, useMemo, useRef, useSyncExternalStore, type ReactElement, type Ref } from "react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from "../../components/Icons.tsx";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { PRIORITY } from "../../keybindings/dispatcher.ts";
import type { ChatTranscript } from "./reducer.ts";
import { highlightTranscript, transcriptMatches } from "./transcriptSearch.ts";
import "./transcriptSearch.css";

type SearchState = { kind: "closed" } | { kind: "open"; query: string; index: number; focus: number };
let state: SearchState = { kind: "closed" };
const listeners = new Set<() => void>();
const snapshot = () => state;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function change(next: SearchState) {
  state = next;
  for (const listener of listeners) listener();
}

export function TranscriptSearch({ transcript, children }: {
  transcript: ChatTranscript;
  children: ReactElement<{ ref?: Ref<HTMLDivElement> }>;
}) {
  const search = useSyncExternalStore(subscribe, snapshot, snapshot);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = search.kind === "open" ? search.query : "";
  const focus = search.kind === "open" ? search.focus : 0;
  const matches = useMemo(() => transcriptMatches(transcript, query), [transcript, query]);
  const index = search.kind === "open" ? Math.min(search.index, Math.max(0, matches.length - 1)) : 0;
  const selected = matches[index];
  const close = () => change({ kind: "closed" });
  const open = () => change(search.kind === "open" ? { ...search, focus: search.focus + 1 } : { kind: "open", query: "", index: 0, focus: 1 });
  const navigate = (delta: number) => {
    if (search.kind !== "open" || matches.length === 0) return false;
    change({ ...search, index: (index + delta + matches.length) % matches.length });
  };
  const scroll = () => {
    if (!selected) return false;
    const turn = [...(container.current?.querySelectorAll<HTMLElement>(".oc-turn[data-turn-id]") ?? [])].find((node) => node.dataset.turnId === selected.turnId);
    turn?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  useKeybindings({ "chat.search": open }, { enableOnTerminalFocus: false });
  useKeybindings({
    "chat.searchNext": () => navigate(1),
    "chat.searchPrevious": () => navigate(-1),
    "chat.scrollToMatch": scroll,
  }, { priority: PRIORITY.HIGH, enabled: search.kind === "open", enableOnTerminalFocus: false });

  const session = useRef<string>();
  useEffect(() => {
    const next = session.current !== transcript.sessionId ? 0 : index;
    session.current = transcript.sessionId;
    if (state.kind === "open" && state.index !== next) change({ ...state, index: next });
  }, [transcript.sessionId, index]);
  useEffect(() => {
    if (search.kind !== "open") return;
    input.current?.focus();
    input.current?.select();
  }, [search.kind, focus]);
  useEffect(() => {
    const root = container.current;
    if (!root || !query.trim()) return;
    let cleanup: (() => void) | undefined;
    const frame = requestAnimationFrame(() => {
      cleanup = highlightTranscript(root, query, selected);
      scroll();
    });
    return () => { cancelAnimationFrame(frame); cleanup?.(); };
  }, [transcript, query, selected]);

  return <>
    {search.kind === "open" ? (
      <div className="term-find chat-find" role="search" aria-label="Find in chat" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); navigate(e.shiftKey ? -1 : 1); }
      }}>
        <span className="term-find-icon"><SearchIcon size={16} /></span>
        <input ref={input} type="text" placeholder="Find in top-level messages" value={query}
          onChange={(e) => change({ ...search, query: e.target.value, index: 0 })}
          autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        <span className="term-find-count" aria-live="polite">{matches.length > 0 ? index + 1 : 0} of {matches.length}</span>
        <div className="term-find-buttons" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <button type="button" title="Previous match" aria-label="Previous match" disabled={matches.length === 0} onClick={() => navigate(-1)}><ChevronUpIcon size={16} /></button>
          <button type="button" title="Next match" aria-label="Next match" disabled={matches.length === 0} onClick={() => navigate(1)}><ChevronDownIcon size={16} /></button>
          <button type="button" title="Close search" aria-label="Close search" onClick={close}><CloseIcon size={16} /></button>
        </div>
      </div>
    ) : null}
    {cloneElement(children, { ref: container })}
  </>;
}
