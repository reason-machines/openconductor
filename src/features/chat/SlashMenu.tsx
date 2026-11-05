// The composer's "/" menu, after Conductor's suggestion popup (`FNi`, DOM in
// evidence/chat/composer/README.md): a list that sits on top of the composer
// box, 8 px in from each side, with "/", the command name (matched letters
// bright, the rest dimmed while a query is typed) and its description. The
// focused row is highlighted; ↑/↓ move, Enter or Tab pick, Esc closes. The
// keys are handled by the composer's text box (Composer.tsx).

import { useEffect, useRef } from "react";
import type { SlashMatch } from "./slashCommands.ts";

export interface SlashMenuProps {
  matches: readonly SlashMatch[];
  focused: number;
  hasQuery: boolean;
  onPick: (name: string) => void;
  onFocus: (index: number) => void;
}

export function SlashMenu({ matches, focused, hasQuery, onPick, onFocus }: SlashMenuProps) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-list-index="${focused}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focused]);
  if (matches.length === 0) return null;
  return (
    <div className="oc-suggest" role="listbox" aria-label="Slash commands" data-suggestion-popup ref={list}>
      {matches.map((m, i) => (
        <div
          key={m.command.name}
          role="option"
          aria-selected={i === focused}
          data-list-index={i}
          className="oc-suggest-row"
          data-focused={i === focused || undefined}
          onMouseMove={() => i !== focused && onFocus(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(m.command.name);
          }}
        >
          <span className="oc-suggest-slash">/</span>
          <span className="oc-suggest-name">
            <Highlight text={m.command.name} indices={m.indices} hasQuery={hasQuery} />
          </span>
          <span className="oc-suggest-desc">{m.command.description}</span>
        </div>
      ))}
    </div>
  );
}

/** Conductor's `u2`: matched letters plain, the rest at half opacity, while a query is typed. */
function Highlight({ text, indices, hasQuery }: { text: string; indices: readonly number[]; hasQuery: boolean }) {
  if (!hasQuery) return <>{text}</>;
  if (indices.length === 0) return <span className="oc-dim">{text}</span>;
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
        <span key={i} className={p.hit ? undefined : "oc-dim"}>
          {p.text}
        </span>
      ))}
    </span>
  );
}
