import { useEffect, useRef } from "react";
import { FileTypeIcon, FolderTypeIcon } from "../../components/FileIcons";
import type { FileMatch } from "../../spotlight/quickOpen";
import { mentionHighlights } from "./fileMentions.ts";

interface Props {
  matches: readonly FileMatch[];
  focused: number;
  hasQuery: boolean;
  onPick: (path: string) => void;
  onFocus: (index: number) => void;
}

export function FileMentionMenu({ matches, focused, hasQuery, onPick, onFocus }: Props) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-list-index="${focused}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focused]);
  return (
    <div className="oc-suggest oc-file-mentions" role="listbox" aria-label="Mention files" data-suggestion-popup ref={list}>
      {matches.map((match, index) => {
        const path = match.relative_path;
        const slash = path.lastIndexOf("/");
        const highlight = (text: string, offset: number) => hasQuery
          ? mentionHighlights(text, match.match_indices, offset).map((run, i) => <span key={i} className={run.matched ? undefined : "oc-dim"}>{run.text}</span>)
          : text;
        return (
          <div key={path} role="option" aria-selected={index === focused} data-list-index={index} className="oc-file-mention-row" data-focused={index === focused || undefined}
            onMouseMove={() => index !== focused && onFocus(index)}
            onMouseDown={(event) => { event.preventDefault(); onPick(path); }}>
            {match.file.is_directory ? <FolderTypeIcon size={12} /> : <FileTypeIcon path={path} size={12} />}
            <span className="oc-file-mention-name">{highlight(path.slice(slash + 1), slash + 1)}</span>
            {slash >= 0 ? <span className={`oc-file-mention-directory${hasQuery ? " has-query" : ""}`}>{highlight(path.slice(0, slash), 0)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
