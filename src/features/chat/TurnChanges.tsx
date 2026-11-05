// parity:diff.turn-changes:ui
// Under a finished turn: one chip per file the turn changed, with its line
// counts. Clicking a chip opens that file's diff scoped to the turn. Up to 3
// files all show; past that the first 2 show and "Show N more changed files"
// reveals 3 more per click (Conductor's layout, evidence/diff/turn-changes.md).
import { useState } from "react";
import { chipLayout, type TurnRef } from "../diff/turnChangesCache.ts";
import { useTurnChanges } from "../diff/useTurnChanges.ts";
import { FileBadge } from "./ToolRows.tsx";

export function TurnChanges({ turn, worktree, onOpenFile }: { turn: TurnRef; worktree: string | null; onOpenFile: (path: string) => void }) {
  const files = useTurnChanges(turn, worktree);
  const [expanded, setExpanded] = useState(0);
  if (!files || files.length === 0) return null;
  const { shown, more, hiddenTotals } = chipLayout(files, expanded);
  return (
    <div className="chat-turn-changes" role="group" aria-label="Files changed in this turn">
      {shown.map((f) => (
        // Conductor's chip (`_Do`): the file badge with its "+N -N" counts (`ID`, zeros shown).
        <FileBadge key={f.path} path={f.path} className="chat-turn-chip" onOpen={onOpenFile}>
          <span className="oc-chip-counts">
            <span className="a">+{f.additions}</span>
            <span className="d">-{f.deletions}</span>
          </span>
        </FileBadge>
      ))}
      {more ? (
        <button type="button" className="chat-turn-chip more" title={`+${hiddenTotals.additions} -${hiddenTotals.deletions} in the rest`} onClick={() => setExpanded((n) => n + 1)}>
          {more}
        </button>
      ) : null}
    </div>
  );
}
