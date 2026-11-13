// Conductor's "Search settings" field at the top of the settings navigation (`a9a`,
// renderApp-D_fmY7hW.js @11,250,104; its result row `l9a` @11,253,266). A 28 px input
// with a 14 px search icon and a "⌘F" key hint ("Search settings shortcut"); typing
// opens a results list under it (anchor width, 6 px below, 30 results at most,
// "No settings match "…"" when empty). ↑/↓ move, Enter opens, Esc clears, and a
// clear button replaces the key hint while there is a query. ⌘F focuses it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CloseIcon, SearchIcon } from "../components/Icons";
import { useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import { effectiveShortcuts } from "../keybindings/overrides";
import { partGlyph, shortcutParts } from "../keybindings/shortcut";
import { searchSettings, type SearchItem } from "./searchIndex";

interface Props {
  items: readonly SearchItem[];
  iconFor: (item: SearchItem) => ReactNode;
  onPick: (item: SearchItem) => void;
}

export function SettingsSearch({ items, iconFor, onPick }: Props) {
  const { overrides } = useKeybindingOverrides();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = query.trim() !== "";
  const results = useMemo(() => searchSettings(items, query), [items, query]);
  const active = Math.min(highlight, Math.max(results.length - 1, 0));
  const clear = () => {
    setQuery("");
    setHighlight(0);
  };
  const pick = (item: SearchItem) => {
    onPick(item);
    clear();
  };

  // ⌘F focuses the field; while results are open, Esc clears the query instead of leaving settings.
  useKeybindings({ "settings.search": () => input.current?.focus() });
  useKeybindings(open ? { "settings.close": clear } : {}, 10);

  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return setBox(null);
    const r = anchor.current.getBoundingClientRect();
    setBox({ left: r.left, top: r.bottom + 6, width: r.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutsidePress = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || anchor.current?.contains(event.target) || list.current?.contains(event.target)) return;
      setQuery("");
      setHighlight(0);
    };
    document.addEventListener("pointerdown", onOutsidePress, true);
    return () => document.removeEventListener("pointerdown", onOutsidePress, true);
  }, [open]);

  const move = (delta: number) => {
    const next = Math.min(Math.max(active + delta, 0), results.length - 1);
    setHighlight(next);
    list.current?.querySelector(`[data-result-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const primaryShortcut = effectiveShortcuts("settings.search", overrides)[0];
  const parts = primaryShortcut ? shortcutParts(primaryShortcut).map(partGlyph) : [];
  return (
    <div className="settings-search" ref={anchor}>
      <SearchIcon size={14} />
      <input
        ref={input}
        type="search"
        value={query}
        placeholder="Search settings"
        spellCheck={false}
        autoComplete="off"
        aria-expanded={open}
        aria-controls={open ? "settings-search-results" : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            move(e.key === "ArrowDown" ? 1 : -1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const r = results[active];
            if (r) pick(r.item);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            clear();
          }
        }}
      />
      {query === "" && parts.length > 0 && (
        <kbd className="settings-search-kbd" aria-label="Search settings shortcut">
          {parts.map((p, i) => (
            <span key={i}>{p}</span>
          ))}
        </kbd>
      )}
      {open && (
        <button type="button" className="settings-search-clear" aria-label="Clear settings search" onClick={clear}>
          <CloseIcon size={14} />
        </button>
      )}
      {open && box && (
        <div
          id="settings-search-results"
          className="settings-search-results"
          role="listbox"
          aria-label="Settings results"
          style={{ left: box.left, top: box.top, width: box.width }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div ref={list} className="settings-search-list">
            {results.map((r, i) => (
              <button
                key={r.item.id}
                type="button"
                role="option"
                aria-selected={i === active}
                data-result-index={i}
                className={`settings-search-result${i === active ? " highlighted" : ""}`}
                onMouseMove={() => setHighlight(i)}
                onClick={() => pick(r.item)}
              >
                <span className="settings-search-result-icon">{iconFor(r.item)}</span>
                <span className="settings-search-result-text">
                  <span className="settings-search-result-label">
                    <Highlight text={r.item.label} indices={r.match.field === "label" ? r.match.indexes : []} />
                  </span>
                  {r.item.tabLabel && <span className="settings-search-result-tab">{r.item.tabLabel}</span>}
                </span>
              </button>
            ))}
            {results.length === 0 && <div className="settings-search-empty">No settings match "{query}"</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Conductor's `u2`: matched letters plain, the rest at half opacity; no label match dims it all. */
function Highlight({ text, indices }: { text: string; indices: readonly number[] }) {
  if (indices.length === 0) return <span className="dim">{text}</span>;
  const hit = new Set(indices);
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const h = hit.has(i);
    const last = parts.at(-1);
    if (last && last.hit === h) last.text += text[i];
    else parts.push({ text: text[i]!, hit: h });
  }
  return (
    <span>
      {parts.map((p, i) => (
        <span key={i} className={p.hit ? undefined : "dim"}>
          {p.text}
        </span>
      ))}
    </span>
  );
}
