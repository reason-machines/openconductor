// Find in terminal (Cmd+F while a terminal has focus). Follows the reference:
// a floating bar at the panel's top right with "Find", an "n of m" counter,
// Previous / Next / Close; Enter goes to the next match, Shift+Enter to the
// previous, Escape closes and returns focus to the terminal. The current match
// is shown as the terminal selection and scrolled into view; matches are
// recomputed whenever the terminal renders, so new output is searched too.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { CloseIcon, SearchIcon } from "../../components/Icons";
import { counterText, findMatches, matchesKey, nextIndex, previousIndex, scrollRow, searchableLines } from "./find";
import { getFindRequests, subscribeTabs, terminalOf } from "./session";

export function useTerminalFind(id: string) {
  const requests = useSyncExternalStore(subscribeTabs, () => getFindRequests(id));
  const seen = useRef(requests);
  const [isOpen, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [index, setIndex] = useState(0);
  const [renders, setRenders] = useState(0);
  const lastTerm = useRef("");
  const lastKey = useRef("");

  useEffect(() => {
    if (requests === seen.current) return;
    seen.current = requests;
    setOpen(true);
    setFocusTrigger((n) => n + 1);
  }, [requests]);

  useEffect(() => {
    const t = terminalOf(id);
    if (!isOpen || !t) return;
    const sub = t.onRender(() => setRenders((n) => n + 1));
    return () => sub.dispose();
  }, [id, isOpen]);

  const matches = useMemo(() => {
    const t = terminalOf(id);
    return !isOpen || !t || term === "" ? [] : findMatches(searchableLines(t.buffer.active), term);
    // `renders` re-reads the buffer after the terminal draws new output.
  }, [id, isOpen, term, renders]);
  const key = useMemo(() => matchesKey(matches), [matches]);

  const goTo = useCallback(
    (i: number) => {
      const t = terminalOf(id);
      const m = matches[i];
      if (!t || !m) return;
      t.scrollToLine(scrollRow(m.lineIndex, t.buffer.active.length, t.rows));
      t.select(m.column, m.lineIndex, m.length);
      setIndex(i);
    },
    [id, matches],
  );

  // A new term jumps to its first match; output that moves the matches keeps
  // the current position (clamped) and re-selects it.
  useEffect(() => {
    const active = isOpen && term !== "" ? term : "";
    if (matches.length === 0) {
      terminalOf(id)?.clearSelection();
      setIndex(0);
      lastTerm.current = "";
      lastKey.current = "";
      return;
    }
    if (lastTerm.current !== active) {
      lastTerm.current = active;
      lastKey.current = key;
      goTo(0);
      return;
    }
    if (lastKey.current !== key || index >= matches.length) {
      lastKey.current = key;
      goTo(Math.min(index, matches.length - 1));
    }
  }, [id, isOpen, term, key, matches.length, index, goTo]);

  const close = useCallback(() => {
    const t = terminalOf(id);
    t?.clearSelection();
    setOpen(false);
    setTerm("");
    setIndex(0);
    t?.focus();
  }, [id]);

  return {
    isOpen,
    term,
    setTerm,
    focusTrigger,
    index,
    count: matches.length,
    next: () => matches.length > 0 && goTo(nextIndex(index, matches.length)),
    previous: () => matches.length > 0 && goTo(previousIndex(index, matches.length)),
    close,
  };
}

type Find = ReturnType<typeof useTerminalFind>;

// Buttons keep focus in the input; clicks stay out of the terminal below.
const keepFocus = (e: MouseEvent) => (e.preventDefault(), e.stopPropagation());
const stop = (e: MouseEvent) => e.stopPropagation();

const ChevronUp = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 15 6-6 6 6" />
  </svg>
);
const ChevronDown = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function FindBar({ find }: { find: Find }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (find.isOpen) {
      input.current?.focus();
      input.current?.select();
    }
  }, [find.focusTrigger, find.isOpen]);
  if (!find.isOpen) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      find.close();
      return;
    }
    if (e.key !== "Enter" || find.count === 0) return;
    e.preventDefault();
    if (e.shiftKey) find.previous();
    else find.next();
  };
  const none = find.count === 0;

  return (
    <div className="term-find" role="search" aria-label="Find in terminal" onClick={stop} onKeyDownCapture={onKeyDown}>
      <span className="term-find-icon">
        <SearchIcon size={16} />
      </span>
      <input
        ref={input}
        type="text"
        placeholder="Find"
        value={find.term}
        onChange={(e) => find.setTerm(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <span className="term-find-count">{counterText(find.count, find.index)}</span>
      <div className="term-find-buttons">
        <button title="Previous match" aria-label="Previous match" onMouseDown={keepFocus} onClick={find.previous} disabled={none}>
          <ChevronUp />
        </button>
        <button title="Next match" aria-label="Next match" onMouseDown={keepFocus} onClick={find.next} disabled={none}>
          <ChevronDown />
        </button>
        <button title="Close search" aria-label="Close search" onMouseDown={keepFocus} onClick={find.close}>
          <CloseIcon size={16} />
        </button>
      </div>
    </div>
  );
}
