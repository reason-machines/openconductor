// parity:diff.navigation:ui
// Floating "Previous comment" / "Next comment" buttons over a file's diff, as
// in Conductor's diff tab (evidence/diff/comment-navigation.md): Previous sits
// at the top and Next at the bottom of the code area, each only while there
// are comments in that direction, with the count and the shortcut. The
// diff.previousComment / diff.nextComment keys go to them first while they
// are mounted, and fall through (to cross-file comment stepping) when the
// file has no comment that way.
//
// Mount <CommentNav> inside the position:relative box that holds the file's
// Pierre CodeView, with that CodeView's handle and item id.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { PRIORITY } from "../../keybindings/dispatcher.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { COMMENT_SCROLL_OFFSET, measureComments, type CommentWindow } from "./nav.ts";
import { toPierreSide } from "./pierre.ts";
import type { LineAnchor } from "./FileDiffView";
import "./CommentNav.css";

// Any annotation and caret type: only scrolling and layout reads are used.
type AnyHandle = CodeViewHandle<any, any>;

export type CommentDirection = "previous" | "next";
const NONE: CommentWindow<LineAnchor> = { previousCount: 0, nextCount: 0 };

export interface CommentNavigation {
  previousCount: number;
  nextCount: number;
  /** Scrolls to the nearest comment that way; false when there is none. */
  navigate: (dir: CommentDirection) => boolean;
  /** Re-measure, e.g. from the CodeView's post-render callback. */
  refresh: () => void;
}

/** Counts and navigation for the comments of one CodeView item, kept current as it scrolls. */
export function useCommentNavigation(handle: AnyHandle | null, itemId: string, anchors: readonly LineAnchor[]): CommentNavigation {
  const [win, setWin] = useState<CommentWindow<LineAnchor>>(NONE);
  const latest = useRef({ handle, itemId, anchors });
  latest.current = { handle, itemId, anchors };

  const apply = useCallback((next: CommentWindow<LineAnchor>) => {
    setWin((cur) => (cur.previousCount === next.previousCount && cur.nextCount === next.nextCount ? cur : next));
  }, []);

  const refresh = useCallback(() => {
    const { handle: h, itemId: id, anchors: a } = latest.current;
    const view = h?.getInstance();
    apply(view ? measureComments(view, id, a) : NONE);
  }, [apply]);

  const view = handle?.getInstance();
  useEffect(() => {
    if (!view) return;
    refresh();
    return view.subscribeToScroll((scrollTop, v) => apply(measureComments(v, latest.current.itemId, latest.current.anchors, scrollTop)));
  }, [view, apply, refresh]);
  useEffect(refresh, [refresh, anchors, itemId]);

  const navigate = useCallback((dir: CommentDirection) => {
    const { handle: h, itemId: id, anchors: a } = latest.current;
    const v = h?.getInstance();
    const target = v ? measureComments(v, id, a)[dir] : undefined;
    if (!h || !target) return false;
    h.scrollTo({ type: "line", id, lineNumber: target.line, side: toPierreSide(target.side), align: "start", offset: COMMENT_SCROLL_OFFSET, behavior: "smooth" });
    return true;
  }, []);

  return { previousCount: win.previousCount, nextCount: win.nextCount, navigate, refresh };
}

function Hint({ commandId }: { commandId: string }) {
  const { overrides } = useKeybindingOverrides();
  const s = effectiveShortcuts(commandId, overrides)[0];
  return s ? <kbd className="oc-comment-nav-key">{glyphs(s)}</kbd> : null;
}

const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} />
  </svg>
);

/** The two floating buttons. Keys bound one step above normal so they win while mounted. */
export function CommentNav({ previousCount, nextCount, navigate }: Pick<CommentNavigation, "previousCount" | "nextCount" | "navigate">) {
  useKeybindings(
    {
      "diff.previousComment": () => navigate("previous"),
      "diff.nextComment": () => navigate("next"),
    },
    PRIORITY.HIGH + 1,
  );
  return (
    <>
      {previousCount > 0 && (
        <div className="oc-comment-nav top">
          <button className="btn btn-small" onClick={() => navigate("previous")}>
            <Chevron up />
            Previous comment
            <span className="count">{previousCount}</span>
            <Hint commandId="diff.previousComment" />
          </button>
        </div>
      )}
      {nextCount > 0 && (
        <div className="oc-comment-nav bottom">
          <button className="btn btn-small" onClick={() => navigate("next")}>
            <Chevron up={false} />
            Next comment
            <span className="count">{nextCount}</span>
            <Hint commandId="diff.nextComment" />
          </button>
        </div>
      )}
    </>
  );
}
