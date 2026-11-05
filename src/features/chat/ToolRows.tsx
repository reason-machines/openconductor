// Tool call rows as Conductor draws them (renderApp `Mu` row shell and the
// per-tool components listed in conductorTools.ts). A row is one line: the
// tool's icon (a chevron while hovered), a label, and a muted right-hand part
// (command, match count, file badge). Clicking a row with content opens it
// below; collapsed is the default and the right-hand part hides while open,
// except for rows whose right part is a file badge.

import { useState, type ReactNode } from "react";
import { FILE_GLYPHS, LUCIDE, type IconNode } from "./toolIconData.ts";
import {
  baseName,
  editCounts,
  genericSummary,
  grepMatches,
  mcpLabel,
  readContent,
  readLabel,
  shortPath,
  stripMarkers,
  toolKind,
  type ConductorTool,
} from "./conductorTools.ts";
import type { ToolStatus } from "./view.ts";

type LucideName = keyof typeof LUCIDE;

export function Lucide({ name, className }: { name: LucideName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(LUCIDE[name] as readonly IconNode[]).map(([Tag, attrs], i) => {
        const T = Tag as "path";
        return <T key={i} {...(attrs as object)} />;
      })}
    </svg>
  );
}

/** Conductor's `Ju`: the icon for a tool name. */
export function toolIconName(name: string): LucideName {
  switch (toolKind(name)) {
    case "bash":
    case "bash-output":
      return "terminal";
    case "read":
      return "file-text";
    case "grep":
      return "search";
    case "glob":
    case "ls":
      return "file-search";
    case "edit":
    case "multi-edit":
    case "write":
      return "file-pen";
    case "todo":
      return "square-check-big";
    case "web":
      return "globe";
    case "sub-agent":
      return name === "Task" || name === "Agent" ? "file-code" : "bot";
    default:
      return name === "ToolSearch" ? "search" : name === "Thinking" ? "brain" : "wrench";
  }
}

export function ToolIcon({ name, className = "oc-tool-icon" }: { name: string; className?: string }) {
  return <Lucide name={toolIconName(name)} className={className} />;
}

// ---- File badge (`tee` / `QZ`) and its file-type glyph (`VV`) -----------------

type Glyph = keyof typeof FILE_GLYPHS;

const GLYPH_BY_EXT: Record<string, [Glyph, string]> = {
  ts: ["typescript", "blue-600"],
  mts: ["typescript", "blue-600"],
  cts: ["typescript", "blue-600"],
  tsx: ["react", "cyan-400"],
  jsx: ["react", "cyan-400"],
  js: ["javascript", "yellow-400"],
  mjs: ["javascript", "yellow-400"],
  cjs: ["javascript", "yellow-400"],
  json: ["json", "yellow-600"],
  jsonc: ["json", "yellow-600"],
  md: ["markdown", "documentation"],
  mdx: ["markdown", "documentation"],
  css: ["css", "blue-600"],
  html: ["html", "orange-600"],
  htm: ["html", "orange-600"],
  py: ["python", "blue-500"],
  rs: ["rust", "orange-700"],
  go: ["go", "cyan-600"],
  yml: ["yaml", "red-600"],
  yaml: ["yaml", "red-600"],
  sh: ["bash", "green-600"],
  bash: ["bash", "green-600"],
  zsh: ["bash", "green-600"],
  toml: ["settings", "gray-600"],
  ini: ["settings", "gray-600"],
  txt: ["file-text", "gray-600"],
  png: ["file-image", "green-500"],
  jpg: ["file-image", "green-500"],
  jpeg: ["file-image", "green-500"],
  gif: ["file-image", "green-500"],
  svg: ["file-image", "green-500"],
  webp: ["file-image", "green-500"],
};

export function FileGlyph({ path }: { path: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const [glyph, tint] = GLYPH_BY_EXT[ext] ?? (["file", "muted"] as [Glyph, string]);
  const g = FILE_GLYPHS[glyph];
  return (
    <svg className="oc-file-glyph" data-tint={tint} viewBox={g.viewBox} fill="currentColor" role="img" aria-hidden>
      {(g.nodes as readonly IconNode[]).map(([Tag, attrs], i) => {
        const T = Tag as "path";
        return <T key={i} {...(attrs as object)} />;
      })}
    </svg>
  );
}

export function FileBadge({ path, onOpen, children, className }: { path: string; onOpen?: (path: string) => void; children?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={`oc-file-badge filebadge${className ? ` ${className}` : ""}`}
      title={path}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(path);
      }}
    >
      <FileGlyph path={path} />
      <span className="oc-file-badge-name">{baseName(path)}</span>
      {children}
    </button>
  );
}

/** `LD`: a muted monospace chip (a command, a pattern). */
export function CodeChip({ text }: { text: string }) {
  return <span className="oc-code-chip">{text}</span>;
}

/** `fIt`: "+N −N" with plus and minus icons, for Edit and MultiEdit. */
export function LineCounts({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="oc-line-counts">
      <span className="add">
        <Lucide name="plus" className="oc-line-counts-icon" />
        {added}
      </span>
      <span className="del">
        <Lucide name="minus" className="oc-line-counts-icon" />
        {removed}
      </span>
    </span>
  );
}

// ---- Row shell (`Mu`) ----------------------------------------------------------

interface ShellProps {
  icon: ReactNode;
  left: ReactNode;
  right?: ReactNode;
  /** `alwaysShowRightContent`: keep the right part while open (file badges). */
  keepRight?: boolean;
  /** `contentAlignment`: "center" for rows whose right part is a chip or badge. */
  align?: "center" | "baseline";
  /** Row content when opened; no content means the row does not open. */
  content?: ReactNode;
  /** `isCodeBlock`: the content brings its own frame. */
  bareContent?: boolean;
  open: boolean;
  onToggle: () => void;
  tone?: "error";
  status?: ToolStatus;
}

function RowShell({ icon, left, right, keepRight = false, align = "baseline", content, bareContent = false, open, onToggle, tone, status }: ShellProps) {
  const opens = content !== undefined && content !== null && content !== false;
  const collapsed = !opens || !open;
  return (
    <div className="oc-tool" data-tone={tone} data-status={status}>
      <div className={`oc-tool-head${opens ? " opens" : ""}`} onClick={opens ? onToggle : undefined} role={opens ? "button" : undefined} aria-expanded={opens ? open : undefined}>
        <div className="oc-tool-icon-slot">
          {opens ? (
            <div className="oc-tool-icon-swap">
              <div className="oc-tool-icon-idle">{icon}</div>
              <Lucide name={collapsed ? "plus" : "minus"} className="oc-tool-icon-hover" />
            </div>
          ) : (
            icon
          )}
        </div>
        <div className={`oc-tool-main align-${align}`}>
          <div className="oc-tool-left">{left}</div>
          {right ? <div className={`oc-tool-right${!keepRight && !collapsed ? " hidden" : ""}`}>{right}</div> : null}
        </div>
      </div>
      {opens && open ? <div className={bareContent ? "oc-tool-content bare" : "oc-tool-content"}>{content}</div> : null}
    </div>
  );
}

// ---- Rows ----------------------------------------------------------------------

export interface ToolRowProps {
  tool: ConductorTool;
  status: ToolStatus;
  result?: string;
  isError: boolean;
  open: boolean;
  onToggle: () => void;
  workspacePath?: string;
  onOpenFile?: (path: string) => void;
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

/** `AI`: a failed tool's error line under its row. */
function ErrorRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <RowShell
      icon={<Lucide name="circle-x" className="oc-tool-icon" />}
      left={<span>Error</span>}
      right={<span className="oc-error-chip">{text}</span>}
      align="center"
      content={text}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      tone="error"
    />
  );
}

export function ConductorToolRow(props: ToolRowProps) {
  const row = <Row {...props} />;
  if (!props.isError || !props.result) return row;
  return (
    <>
      {row}
      <ErrorRow text={props.result} />
    </>
  );
}

function Row({ tool, status, result, isError, open, onToggle, workspacePath, onOpenFile }: ToolRowProps) {
  const { name, input } = tool;
  const icon = <ToolIcon name={name} />;
  const shell = { icon, open, onToggle, status };
  const output = isError ? undefined : result;
  switch (toolKind(name)) {
    case "bash": {
      const command = s(input.command);
      return (
        <RowShell
          {...shell}
          left={<span>{s(input.description) || "Bash"}</span>}
          right={command ? <CodeChip text={command} /> : undefined}
          align="center"
          bareContent
          content={
            <pre className="oc-tool-code">
              <code>
                <span className="oc-tool-prompt">$ </span>
                {command}
                {output ? `\n\n${output}` : ""}
              </code>
            </pre>
          }
        />
      );
    }
    case "read": {
      const path = s(input.file_path);
      const text = output === undefined ? undefined : readContent(output);
      return (
        <RowShell
          {...shell}
          left={<span>{readLabel(path, output)}</span>}
          right={path ? <FileBadge path={path} onOpen={onOpenFile} /> : undefined}
          keepRight
          align="center"
          bareContent
          content={text ? <NumberedCode text={text} start={typeof input.offset === "number" ? input.offset : 1} /> : undefined}
        />
      );
    }
    case "grep": {
      const path = s(input.path);
      const include = s(input.include);
      return (
        <RowShell
          {...shell}
          left={
            <>
              grep for '{s(input.pattern)}'
              {path ? (
                <>
                  {" in "}
                  <code className="oc-tool-inline-code">{shortPath(path, workspacePath)}</code>
                </>
              ) : null}
              {include ? ` (include: ${include})` : null}
            </>
          }
          right={output !== undefined && output !== "" ? <span className="oc-tool-count">{grepMatches(output)} matches</span> : undefined}
          content={output ? output : undefined}
        />
      );
    }
    case "glob":
    case "ls": {
      const label = toolKind(name) === "glob" ? "Glob" : "List files";
      const chip = toolKind(name) === "glob" ? s(input.pattern) : s(input.path) || ".";
      return <RowShell {...shell} left={<span>{label}</span>} right={<CodeChip text={chip} />} align="center" content={output ? output : undefined} />;
    }
    case "edit": {
      const path = s(input.file_path);
      const counts = editCounts(input);
      return (
        <RowShell
          {...shell}
          left={<span>Edit</span>}
          right={
            <div className="oc-tool-right-row">
              {path ? <FileBadge path={path} onOpen={onOpenFile} /> : null}
              {counts ? <LineCounts {...counts} /> : null}
            </div>
          }
          keepRight
          align="center"
          bareContent
          content={counts ? <DiffBlock oldText={stripMarkers(s(input.old_string))} newText={stripMarkers(s(input.new_string))} /> : undefined}
        />
      );
    }
    case "multi-edit": {
      const path = s(input.file_path);
      const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
      const totals = edits.reduce<{ added: number; removed: number }>(
        (t, e) => {
          const c = editCounts(e) ?? { added: 0, removed: 0 };
          return { added: t.added + c.added, removed: t.removed + c.removed };
        },
        { added: 0, removed: 0 },
      );
      return (
        <RowShell
          {...shell}
          left={<span>{`${edits.length} ${edits.length === 1 ? "edit" : "edits"}`}</span>}
          right={
            <div className="oc-tool-right-row">
              {path ? <FileBadge path={path} onOpen={onOpenFile} /> : null}
              <LineCounts {...totals} />
            </div>
          }
          keepRight
          align="center"
        />
      );
    }
    case "write": {
      const path = s(input.file_path);
      const content = s(input.content);
      return (
        <RowShell
          {...shell}
          left={<span>{`Write ${content.split("\n").length} lines`}</span>}
          right={path ? <FileBadge path={path} onOpen={onOpenFile} /> : undefined}
          align="center"
          bareContent
          content={<DiffBlock oldText="" newText={content} />}
        />
      );
    }
    case "web": {
      const target = s(input.url) || s(input.query);
      return (
        <RowShell
          {...shell}
          left={<span>{name === "WebSearch" ? "Web Search" : "Web Browse"}</span>}
          right={target ? <CodeChip text={target} /> : undefined}
          align="center"
          content={output ? output : undefined}
        />
      );
    }
    case "todo": {
      const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : [];
      const done = todos.filter((t) => t.status === "completed").length;
      return (
        <RowShell
          {...shell}
          left={<span>{done > 0 && done < todos.length ? "Todo completed" : "Update todos"}</span>}
          right={todos.length > 0 ? <span className="oc-tool-count">{`${done}/${todos.length} completed`}</span> : undefined}
          content={todos.length > 0 ? todos.map((t) => `${t.status === "completed" ? "✓" : "○"} ${s(t.content)}`).join("\n") : undefined}
        />
      );
    }
    default: {
      const mcp = name.startsWith("mcp__");
      const summary = genericSummary(name, input);
      const body = [Object.keys(input).length > 0 ? JSON.stringify(input, null, 2) : "", output ?? ""].filter(Boolean).join("\n\n");
      return (
        <RowShell
          {...shell}
          left={mcp || name === "ToolSearch" ? <span>{mcpLabel(name)}</span> : <span className="oc-lowercase">{name}</span>}
          right={summary ? <CodeChip text={summary} /> : undefined}
          align="center"
          content={body || undefined}
        />
      );
    }
  }
}

function NumberedCode({ text, start }: { text: string; start: number }) {
  const lines = text.split("\n");
  return (
    <pre className="oc-tool-code numbered">
      {lines.map((l, i) => (
        <div key={i} className="oc-code-line">
          <span className="oc-code-ln">{start + i}</span>
          <span>{l}</span>
        </div>
      ))}
    </pre>
  );
}

function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
  const removed = oldText ? oldText.split("\n") : [];
  const added = newText ? newText.split("\n") : [];
  return (
    <pre className="oc-tool-code diff">
      {removed.map((l, i) => (
        <div key={`d${i}`} className="oc-code-line del">
          <span className="oc-code-ln">-</span>
          <span>{l}</span>
        </div>
      ))}
      {added.map((l, i) => (
        <div key={`a${i}`} className="oc-code-line add">
          <span className="oc-code-ln">+</span>
          <span>{l}</span>
        </div>
      ))}
    </pre>
  );
}
