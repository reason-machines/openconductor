// parity:diff.file-render:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.virtualized:ui
import type { ReactNode } from "react";
import { splitRows, unifiedRows, type Span } from "./rows.ts";
import type { CommentSide } from "./comments.ts";
import type { DiffLayout, DiffLine, FileDiff } from "./types.ts";

export interface LineAnchor {
  side: CommentSide;
  line: number;
}

interface Props {
  file: FileDiff;
  layout: DiffLayout;
  ignoreWhitespace: boolean;
  viewed: boolean;
  onToggleViewed: () => void;
  /** Clicking a line number starts a comment there. */
  onLineClick?: (anchor: LineAnchor) => void;
  /** Rows rendered under a line (comment threads, the comment composer). */
  annotations?: (anchor: LineAnchor) => ReactNode;
}

function Text({ text, span, kind }: { text: string; span?: Span; kind: DiffLine["kind"] }) {
  if (!span || kind === "context") return <>{text}</>;
  return (
    <>
      {text.slice(0, span[0])}
      <mark className={kind}>{text.slice(span[0], span[1])}</mark>
      {text.slice(span[1])}
    </>
  );
}

const sign = (l: DiffLine) => (l.kind === "addition" ? "+" : l.kind === "deletion" ? "-" : " ");
const anchorOf = (l: DiffLine): LineAnchor => (l.kind === "deletion" ? { side: "old", line: l.old_line! } : { side: "new", line: l.new_line! });

export function FileDiffView({ file, layout, ignoreWhitespace, viewed, onToggleViewed, onLineClick, annotations }: Props) {
  const cols = layout === "split" ? 6 : 4;
  const num = (n: number | null, side: CommentSide) => (
    <td className="num" onClick={n !== null && onLineClick ? () => onLineClick({ side, line: n }) : undefined}>
      {n ?? ""}
    </td>
  );
  const note = (anchor: LineAnchor | null, key: string) => {
    const content = anchor && annotations?.(anchor);
    return content ? (
      <tr className="annotation" key={key}>
        <td colSpan={cols}>{content}</td>
      </tr>
    ) : null;
  };

  let body: ReactNode;
  if (file.binary) body = <div className="oc-file-note">Binary file not shown.</div>;
  else if (file.hunks.length === 0)
    body = <div className="oc-file-note">{ignoreWhitespace ? "Only whitespace changed in this file." : "No content changes in this file."}</div>;
  else
    body = (
      <table className={`oc-code ${layout}`}>
        <colgroup>
          {(layout === "split" ? ["num", "sign", "code", "num", "sign", "code"] : ["num", "num", "sign", "code"]).map((c, i) => (
            <col key={i} className={c} />
          ))}
        </colgroup>
        <tbody>
          {file.hunks.map((h, hi) => [
            <tr className="hunk" key={`h${hi}`}>
              <td colSpan={cols}>
                @@ -{h.old_start},{h.old_lines} +{h.new_start},{h.new_lines} @@ {h.section}
              </td>
            </tr>,
            ...(layout === "unified"
              ? unifiedRows(h).flatMap((r, ri) => [
                  <tr className={r.line.kind} key={`${hi}-${ri}`}>
                    {num(r.line.old_line, "old")}
                    {num(r.line.new_line, "new")}
                    <td className="sign">{sign(r.line)}</td>
                    <td className="code">
                      <Text text={r.line.text} span={r.emphasis} kind={r.line.kind} />
                    </td>
                  </tr>,
                  note(anchorOf(r.line), `${hi}-${ri}-n`),
                ])
              : splitRows(h).flatMap((r, ri) => [
                  <tr key={`${hi}-${ri}`}>
                    {num(r.left?.old_line ?? null, "old")}
                    <td className="sign">{r.left ? sign(r.left) : ""}</td>
                    <td className={`code ${r.left ? r.left.kind : "pad"}`}>{r.left && <Text text={r.left.text} span={r.leftEmphasis} kind={r.left.kind} />}</td>
                    {num(r.right?.new_line ?? null, "new")}
                    <td className="sign">{r.right ? sign(r.right) : ""}</td>
                    <td className={`code ${r.right ? r.right.kind : "pad"}`}>{r.right && <Text text={r.right.text} span={r.rightEmphasis} kind={r.right.kind} />}</td>
                  </tr>,
                  r.left && r.left.kind === "deletion" ? note(anchorOf(r.left), `${hi}-${ri}-l`) : null,
                  note(r.right ? anchorOf(r.right) : null, `${hi}-${ri}-r`),
                ])),
          ])}
        </tbody>
      </table>
    );

  return (
    <section className="oc-file" id={`oc-file-${encodeURIComponent(file.path)}`} data-viewed={viewed || undefined}>
      <header className="oc-file-header">
        <span className={`oc-status ${file.status}`}>{STATUS_LETTER[file.status]}</span>
        <span className="path" title={file.path}>
          {file.old_path ? `${file.old_path} → ` : ""}
          {file.path}
        </span>
        <span className="oc-count">
          <span className="a">+{file.additions}</span>
          <span className="d">-{file.deletions}</span>
        </span>
        <label title="Mark this file as viewed">
          <input type="checkbox" checked={viewed} onChange={onToggleViewed} /> Viewed
        </label>
      </header>
      {!viewed && body}
    </section>
  );
}

export const STATUS_LETTER: Record<FileDiff["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  type_changed: "T",
  untracked: "U",
};
