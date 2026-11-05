// parity:diff.turn-changes:ui
// In a finished turn's footer row, after the time and actions: one chip per
// file the turn changed, with its line counts. Clicking a chip opens that
// file's diff scoped to the turn. Up to 3 files all show; past that the first 2
// show and a "+N more" button (with the rest's line totals, tooltip "Show 3
// more changed files") reveals 3 more per click on their own line
// (Conductor's `vDo`, evidence/chat/README.md and evidence/diff/turn-changes.md).
import { useState } from "react";
import { chipLayout, type TurnRef } from "../diff/turnChangesCache.ts";
import type { FileChange } from "../diff/types.ts";
import { useTurnChanges } from "../diff/useTurnChanges.ts";

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function Counts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="count">
      <span className="a">+{additions}</span> <span className="d">-{deletions}</span>
    </span>
  );
}

export function TurnChanges({ turn, worktree, onOpenFile }: { turn: TurnRef; worktree: string | null; onOpenFile: (path: string) => void }) {
  const files = useTurnChanges(turn, worktree);
  const [expanded, setExpanded] = useState(0);
  if (!files || files.length === 0) return null;
  const { first, revealed, hidden, more, hiddenTotals } = chipLayout(files, expanded);
  const chip = (f: FileChange) => (
    <button key={f.path} type="button" className="chat-turn-chip" title={`${f.path}: open the changes from this turn`} onClick={() => onOpenFile(f.path)}>
      <span className="name">{basename(f.path)}</span>
      <Counts additions={f.additions} deletions={f.deletions} />
    </button>
  );
  // Two items of the footer row, as in Conductor: the first chips stay on the row
  // (shrinking, names cut short); the revealed chips and "+N more" follow, on a
  // line of their own once anything is revealed.
  return (
    <>
      <span className="chat-turn-changes" role="group" aria-label="Files changed in this turn">
        {first.map(chip)}
      </span>
      {revealed.length > 0 || more ? (
        <span className={revealed.length > 0 ? "chat-turn-changes-more revealed" : "chat-turn-changes-more"}>
          {revealed.map(chip)}
          {more ? (
            <button type="button" className="chat-turn-chip more" title={more} aria-label={more} onClick={() => setExpanded((n) => n + 1)}>
              <span className="name">+{hidden.length} more</span>
              <Counts {...hiddenTotals} />
            </button>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
