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
import { FileBadge, Lucide } from "./ToolRows.tsx";

/** Conductor's `ID` (showZero, no border): "+N -N" in text-3xs mono. */
function Counts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="oc-chip-counts">
      <span className="a">+{additions}</span>
      <span className="d">-{deletions}</span>
    </span>
  );
}

export function TurnChanges({ turn, worktree, onOpenFile }: { turn: TurnRef; worktree: string | null; onOpenFile: (path: string) => void }) {
  const files = useTurnChanges(turn, worktree);
  const [expanded, setExpanded] = useState(0);
  if (!files || files.length === 0) return null;
  const { first, revealed, hidden, more, hiddenTotals } = chipLayout(files, expanded);
  // Conductor's chip (`_Do`): the file badge (file-type glyph, name) with the file's counts.
  const chip = (f: FileChange) => (
    <FileBadge key={f.path} path={f.path} className="chat-turn-chip" onOpen={onOpenFile}>
      <Counts additions={f.additions} deletions={f.deletions} />
    </FileBadge>
  );
  // Two items of the footer row, as in Conductor: the first chips stay on the row
  // (shrinking, names cut short); the revealed chips and "+N more" follow, on a
  // line of their own once anything is revealed.
  return (
    <>
      <span className={expanded > 0 ? "chat-turn-changes revealed" : "chat-turn-changes"} role="group" aria-label="Files changed in this turn">
        {first.map(chip)}
      </span>
      {revealed.length > 0 || more || expanded === 0 ? (
        <span className={revealed.length > 0 ? "chat-turn-changes-more revealed" : "chat-turn-changes-more"}>
          {revealed.map(chip)}
          {more || expanded === 0 ? (
            <button type="button" className={`oc-file-badge chat-turn-chip more${more ? "" : " compact-only"}`} title={more ?? "Show changed files"} aria-label={more ?? "Show changed files"} onClick={() => setExpanded((n) => n + 1)}>
              <Lucide name="file-diff" className="chat-turn-more-icon" />
              <span className="chat-turn-more-compact">{expanded > 0 ? hidden.length : files.length}</span>
              <span className="chat-turn-more-wide">+{hidden.length} more</span>
              <Counts {...hiddenTotals} />
            </button>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
