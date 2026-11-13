// Tool call rows as Conductor draws them (renderApp `Mu` row shell and the
// per-tool components listed in conductorTools.ts). A row is one line: the
// tool's icon (a chevron while hovered), a label, and a muted right-hand part
// (command, match count, file badge). Clicking a row with content opens it
// below; collapsed is the default and the right-hand part hides while open,
// except for rows whose right part is a file badge.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FILE_GLYPHS, LUCIDE, type IconNode } from "./toolIconData.ts";
import {
  askUserState,
  backgroundStatus,
  baseName,
  collabCall,
  editCounts,
  genericSummary,
  grepMatches,
  isTypedSubagent,
  lastTwoSegments,
  lineCounts,
  mcpLabel,
  parseTask,
  parseTaskList,
  readContent,
  readLabel,
  resultText,
  scheduleWakeupAt,
  scheduleWakeupLabel,
  sendMessageLabel,
  skillLabel,
  slashCommandLabel,
  stripMarkers,
  subagentDescription,
  taskIdIn,
  taskUpdateLabel,
  terminalOutput,
  toolKind,
  type CollabAgent,
  type ConductorTool,
  type TaskItem,
} from "./conductorTools.ts";
import { highlight, Markdown } from "./markdown.ts";
import { LinkWithMenu } from "./LinkMenu.tsx";
import { openUrl } from "../../backend.ts";
import { thinkingChipText } from "./thinkingChip.ts";
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

/** Conductor's `Ju`: the icon for a tool name (an unknown name gets the wrench). */
const ICON_BY_NAME: Record<string, LucideName> = {
  mcp__conductor__askuserquestion: "message-square-more",
  mcp__conductor__AskUserQuestion: "message-square-more",
  mcp__conductor__GetWorkspaceDiff: "file-diff",
  mcp__conductor__DiffComment: "message-square",
  mcp__conductor__GetDiffComments: "messages-square",
  mcp__conductor__GetTerminalOutput: "terminal",
  Bash: "terminal",
  BashOutput: "terminal",
  Read: "file-text",
  NotebookRead: "file-text",
  Grep: "search",
  ToolSearch: "search",
  Monitor: "radio",
  Glob: "file-search",
  LS: "file-search",
  Edit: "file-pen",
  MultiEdit: "file-pen",
  NotebookEdit: "file-pen",
  Write: "file-pen",
  TodoRead: "square-check-big",
  TodoWrite: "square-check-big",
  TaskCreate: "square-check-big",
  TaskList: "square-check-big",
  TaskGet: "square-check-big",
  TaskUpdate: "square-check-big",
  WebSearch: "globe",
  WebFetch: "globe",
  ImageGeneration: "image",
  Task: "file-code",
  Agent: "file-code",
  "sub-agent": "bot",
  Thinking: "brain",
  EnterPlanMode: "clipboard-list",
  ExitPlanMode: "clipboard-list",
  Skill: "biceps-flexed",
  SlashCommand: "slash",
  Teammate: "users",
  SendMessage: "send",
  ScheduleWakeup: "clock",
};

export function toolIconName(name: string): LucideName {
  return ICON_BY_NAME[name] ?? "wrench";
}

export function ToolIcon({ name, className = "oc-tool-icon" }: { name: string; className?: string }) {
  if (name === "mcp__conductor__RunLocalCommand") {
    // `Ju`: a laptop and a terminal side by side.
    return (
      <span className="oc-tool-icon-pair">
        <Lucide name="laptop" className={className} />
        <Lucide name="terminal" className={className} />
      </span>
    );
  }
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
  const [glyph, tint] = (Object.prototype.hasOwnProperty.call(GLYPH_BY_EXT, ext)
    ? GLYPH_BY_EXT[ext]
    : undefined) ?? (["file", "muted"] as [Glyph, string]);
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

export function FileBadge({ path, onOpen, children, className, hoverContent }: { path: string; onOpen?: (path: string) => void; children?: ReactNode; className?: string; hoverContent?: ReactNode }) {
  const button = (
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
  return hoverContent ? <FileBadgeHover content={hoverContent}>{button}</FileBadgeHover> : button;
}

function FileBadgeHover({ content, children }: { content: ReactNode; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = at !== null;
  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  function close() {
    clearTimer();
    setAt(null);
  }
  function enter() {
    clearTimer();
    if (open) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) setAt({ left: rect.left, top: rect.top - 8 });
    }, 150);
  }
  function leave() {
    clearTimer();
    if (open) timer.current = setTimeout(close, 100);
  }
  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    if (!open || !anchor.current || !card.current) return;
    const trigger = anchor.current.getBoundingClientRect();
    const popup = card.current.getBoundingClientRect();
    setAt({
      left: Math.max(16, Math.min(trigger.left, window.innerWidth - popup.width - 16)),
      top: Math.max(16, Math.min(trigger.top - popup.height - 8, window.innerHeight - popup.height - 16)),
    });
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && card.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  return (
    <span
      ref={anchor}
      style={{ display: "inline-flex", minWidth: 0, maxWidth: "100%" }}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") enter(); }}
      onPointerLeave={leave}
    >
      {children}
      {at ? (
        <div
          ref={card}
          role="region"
          aria-label="File change preview"
          style={{ position: "fixed", left: at.left, top: at.top, zIndex: 1000, width: "28rem", maxWidth: "calc(100vw - 32px)", maxHeight: "min(20rem, calc(100vh - 32px))", overflow: "auto", border: "1px solid var(--oc-border)", borderRadius: 6, background: "var(--oc-bg)", color: "var(--oc-fg)", whiteSpace: "normal" }}
          onPointerEnter={clearTimer}
          onPointerLeave={leave}
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </div>
      ) : null}
    </span>
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
  isCollapsible?: boolean;
  /** `isCodeBlock`: the content brings its own frame. */
  bareContent?: boolean;
  /** `contentClassName: ""`: the content sits unframed under the label (markdown). */
  plainContent?: boolean;
  /** `leftContentClassName`. */
  leftClass?: string;
  open: boolean;
  onToggle: () => void;
  tone?: "error";
  status?: ToolStatus;
}

function RowShell({ icon, left, right, keepRight = false, align = "baseline", content, isCollapsible = true, bareContent = false, plainContent = false, leftClass, open, onToggle, tone, status }: ShellProps) {
  const hasContent = content !== undefined && content !== null && content !== false;
  const opens = hasContent && isCollapsible;
  const collapsed = !hasContent || !open;
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
          <div className={leftClass ? `oc-tool-left ${leftClass}` : "oc-tool-left"}>{left}</div>
          {right ? <div className={`oc-tool-right${!keepRight && !collapsed ? " hidden" : ""}`}>{right}</div> : null}
        </div>
      </div>
      {hasContent && open ? <div className={bareContent ? "oc-tool-content bare" : plainContent ? "oc-tool-content plain" : "oc-tool-content"}>{content}</div> : null}
    </div>
  );
}

// ---- Rows ----------------------------------------------------------------------

export interface ToolRowProps {
  tool: ConductorTool;
  status: ToolStatus;
  result?: string;
  rawResult?: unknown;
  resultCreatedAt?: string;
  now?: () => number;
  isError: boolean;
  open: boolean;
  onToggle: () => void;
  todoRows?: Record<"completed" | "started", Pick<ShellProps, "open" | "onToggle">>;
  workspacePath?: string;
  onOpenFile?: (path: string) => void;
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

/** `AI`: a failed tool's error line under its row. */
function ErrorRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.includes("File has not been read yet. Read it first before writing to it.")) {
    return (
      <div className="oc-tool-aside" style={{ paddingLeft: 20, paddingTop: 8, borderRadius: 8 }}>
        Claude Code has to retry the file edit because of a bug in its permissions logic. Just a moment!
      </div>
    );
  }
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

/** Row kinds whose Conductor component adds the `AI` error row under a failed call. */
const ERROR_ROW_KINDS = new Set(["bash", "run-local-command", "bash-output", "grep", "edit", "multi-edit", "write", "web", "task-create", "task-list", "task-get", "task-update"]);

/** Rows Conductor opens until the user closes them (`defaultCollapsed: false`). */
export function opensByDefault(tool: ConductorTool): boolean {
  const kind = toolKind(tool.name);
  return kind === "exit-plan-mode" || kind === "image-generation";
}

export function ConductorToolRow(props: ToolRowProps) {
  const row = <Row {...props} />;
  const kind = toolKind(props.tool.name);
  const errorResult = kind === "bash-output" && props.rawResult !== undefined
    ? typeof props.rawResult === "string" ? props.rawResult : undefined
    : props.result;
  if (!props.isError || !errorResult || !ERROR_ROW_KINDS.has(kind)) return row;
  return (
    <>
      {row}
      <ErrorRow text={errorResult} />
    </>
  );
}

function Row({ tool, status, result, rawResult, resultCreatedAt, now, isError, open, onToggle, todoRows, workspacePath, onOpenFile }: ToolRowProps) {
  const { name, input } = tool;
  const icon = <ToolIcon name={name} />;
  const shell = { icon, open, onToggle, status };
  const output = isError ? undefined : result;
  switch (toolKind(name)) {
    case "bash":
      return <BashRow {...shell} input={input} output={output} />;
    case "run-local-command": {
      // `I0o`: the Bash row with a laptop icon, its reason and extended-timeout note above it.
      const reason = s(input.reason);
      const extended = s(input.extendedTimeoutReason);
      return (
        <div className="oc-tool-stack">
          {reason ? <p className="oc-tool-aside">{reason}</p> : null}
          {extended ? <p className="oc-tool-aside">Extended timeout: {extended}</p> : null}
          <BashRow {...shell} icon={<ToolIcon name={name} />} input={{ command: input.command, description: s(input.description) || "Local command" }} output={output === undefined ? undefined : textBlocks(output)} />
        </div>
      );
    }
    case "read": {
      const path = s(input.file_path);
      const readResult = name === "Read" ? result : output;
      const text = readResult === undefined ? undefined : readContent(readResult);
      const languages: Record<string, string> = {
        js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
        py: "python", rs: "rust", json: "json", yml: "yaml", yaml: "yaml",
        css: "css", html: "html", htm: "html", xml: "xml", sh: "bash", bash: "bash",
      };
      const language = languages[path.split(".").pop()?.toLowerCase() ?? ""];
      const imageExtensions = { png: true, jpg: true, jpeg: true, gif: true, webp: true, tif: true, tiff: true, avif: true, bmp: true };
      const extension = path.split(".").pop()?.toLowerCase();
      const isImage = extension !== undefined && Object.prototype.hasOwnProperty.call(imageExtensions, extension);
      return (
        <RowShell
          {...shell}
          isCollapsible={!isImage}
          left={<span>{readLabel(path, readResult)}</span>}
          right={path ? <FileBadge path={path} onOpen={onOpenFile} /> : undefined}
          keepRight
          align="center"
          bareContent
          content={text ? <NumberedCode text={text} start={typeof input.offset === "number" ? input.offset : 1} language={language} /> : undefined}
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
                  <code className="oc-tool-inline-code">{lastTwoSegments(path)}</code>
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
      const content = toolKind(name) === "glob" && output ? (
        <code>{output.split("\n").filter((line) => line.trim()).map((line, index) => {
          const trimmed = line.trim();
          return <div key={index}>{trimmed.includes(" ") ? line : trimmed}</div>;
        })}</code>
      ) : output;
      return <RowShell {...shell} left={<span>{label}</span>} right={<CodeChip text={chip} />} align="center" content={content || undefined} />;
    }
    case "edit": {
      const path = s(input.file_path);
      const { oldText, newText } = (() => {
        if (rawResult && typeof rawResult === "object" && !Array.isArray(rawResult) && "diffString" in rawResult && typeof rawResult.diffString === "string" && rawResult.diffString) {
          const oldLines: string[] = [];
          const newLines: string[] = [];
          for (const line of rawResult.diffString.split("\n")) {
            if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("@@")) continue;
            if (line.startsWith("-")) oldLines.push(line.slice(1));
            else if (line.startsWith("+")) newLines.push(line.slice(1));
            else {
              const context = line.startsWith(" ") ? line.slice(1) : line;
              oldLines.push(context);
              newLines.push(context);
            }
          }
          return { oldText: oldLines.join("\n"), newText: newLines.join("\n") };
        }
        return { oldText: stripMarkers(s(input.old_string)), newText: stripMarkers(s(input.new_string)) };
      })();
      const counts = oldText || newText ? lineCounts(oldText, newText) : undefined;
      return (
        <RowShell
          {...shell}
          left={<span>Edit</span>}
          right={
            <div className="oc-tool-right-row">
              {path ? <FileBadge path={path} onOpen={onOpenFile} hoverContent={counts ? <DiffBlock oldText={oldText} newText={newText} /> : undefined} /> : null}
              {counts ? <LineCounts {...counts} /> : null}
            </div>
          }
          keepRight
          align="center"
          bareContent
          content={counts ? <DiffBlock oldText={oldText} newText={newText} /> : undefined}
        />
      );
    }
    case "multi-edit":
      return <MultiEditRow {...shell} input={input} onOpenFile={onOpenFile} />;
    case "write":
      return <WriteRow {...shell} input={input} onOpenFile={onOpenFile} />;
    case "web": {
      const target = s(input.url) || s(input.query);
      const prompt = s(input.prompt);
      const webOutput = output && output.length > 100000 ? (
        <>
          {output.substring(0, 100000)}
          <div>Content truncated ({output.length.toLocaleString()} chars total)</div>
        </>
      ) : output;
      return (
        <RowShell
          {...shell}
          left={<span>{name === "WebSearch" ? "Web Search" : "Web Browse"}</span>}
          right={target ? <CodeChip text={target} /> : undefined}
          align="center"
          content={output ? (prompt ? <><ul><li>Prompt: <code>{prompt}</code></li></ul>{webOutput}</> : webOutput) : undefined}
        />
      );
    }
    case "todo": {
      let todoSource: unknown = input.todos;
      if (name === "TodoRead") {
        todoSource = rawResult === undefined ? result : rawResult;
        if (typeof todoSource === "string") {
          const match = todoSource.match(/\[[\s\S]*\]/);
          try {
            todoSource = match ? JSON.parse(match[0]) : [];
          } catch {
            todoSource = [];
          }
        }
      }
      const todos = Array.isArray(todoSource) ? (todoSource as Record<string, unknown>[]) : [];
      const done = todos.filter((t) => t.status === "completed").length;
      const activeIndex = todos.findIndex((t) => t.status === "in_progress");
      const active = todos[activeIndex];
      const content = todos.length > 0 ? todos.map((t) => `${t.status === "completed" ? "✓" : "○"} ${s(t.content)}`).join("\n") : name === "TodoRead" ? <p className="oc-task-empty">No todos</p> : undefined;
      if (name === "TodoWrite" && active && done > 0 && done < todos.length) {
        return (
          <>
            <RowShell
              {...shell}
              {...todoRows?.completed}
              left={<span>Todo completed</span>}
              right={<span className="oc-tool-count">{`${done}/${todos.length} completed`}</span>}
              content={content}
            />
            <RowShell
              {...shell}
              {...todoRows?.started}
              left={<span>Todo started</span>}
              right={<span className="oc-tool-count">{`${activeIndex + 1}. ${s(active.content) || "todo"}`}</span>}
              content={content}
            />
          </>
        );
      }
      const nonmixedRead = name === "TodoRead" && todos.length > 0 && !(active && done > 0 && done < todos.length);
      const label = nonmixedRead
        ? active ? "Todo started" : done === todos.length ? "Todo list completed" : done > 0 ? "Todo completed" : "Todo list created"
        : done > 0 && done < todos.length ? "Todo completed" : "Update todos";
      const summary = nonmixedRead
        ? active ? `${activeIndex + 1}. ${s(active.content) || "todo"}` : `${todos.length} ${todos.length === 1 ? "todo" : "todos"}`
        : todos.length > 0 ? `${done}/${todos.length} completed` : undefined;
      return (
        <RowShell
          {...shell}
          left={<span>{label}</span>}
          right={summary ? <span className="oc-tool-count">{summary}</span> : undefined}
          content={content}
        />
      );
    }
    default:
      return <MoreRows {...{ tool, status, result, rawResult, resultCreatedAt, now, isError, open, onToggle, workspacePath, onOpenFile }} />;
  }
}

function WriteRow({ input, onOpenFile, ...shell }: ShellBase & { input: Record<string, unknown>; onOpenFile?: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const path = s(input.file_path);
  const content = s(input.content);
  const long = content.length > 2000;
  const shown = long && !expanded ? content.substring(0, 2000) : content;
  return (
    <RowShell
      {...shell}
      left={<span>{`Write ${content.split("\n").length} lines`}</span>}
      right={path ? <FileBadge path={path} onOpen={onOpenFile} hoverContent={<DiffBlock oldText="" newText={shown} />} /> : undefined}
      align="center"
      bareContent
      content={
        <>
          <DiffBlock oldText="" newText={shown} />
          {long ? (
            <div style={{ borderTop: "1px solid var(--oc-border)", background: "color-mix(in oklab, var(--oc-muted) 30%, transparent)", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="oc-tool-count">{expanded ? "Showing full content" : "Showing first 2,000 characters"}</span>
              <button type="button" className="oc-text-action" style={{ padding: 0, color: "var(--accent)" }} onClick={() => setExpanded((previous) => !previous)}>
                {expanded ? "Show less" : "Show more"}
              </button>
            </div>
          ) : null}
        </>
      }
    />
  );
}

function MultiEditRow({ input, onOpenFile, ...shell }: ShellBase & { input: Record<string, unknown>; onOpenFile?: (path: string) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const path = s(input.file_path);
  const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
  const totals = edits.reduce<{ added: number; removed: number }>(
    (total, edit) => {
      const counts = editCounts(edit) ?? { added: 0, removed: 0 };
      return { added: total.added + counts.added, removed: total.removed + counts.removed };
    },
    { added: 0, removed: 0 },
  );
  return (
    <RowShell
      {...shell}
      left={<span>{`${edits.length} ${edits.length === 1 ? "edit" : "edits"}`}</span>}
      right={
        <div className="oc-tool-right-row">
          {path ? <FileBadge path={path} onOpen={onOpenFile} hoverContent={<DiffBlock oldText={edits.map((edit) => stripMarkers(s(edit.old_string))).join("\n")} newText={edits.map((edit) => stripMarkers(s(edit.new_string))).join("\n")} />} /> : null}
          <LineCounts {...totals} />
        </div>
      }
      keepRight
      align="center"
      bareContent
      content={
        <div className="oc-multi-edit-list">
          {edits.map((edit, index) => {
            const oldText = s(edit.old_string);
            const newText = s(edit.new_string);
            const open = expanded.has(index);
            return (
              <div className="oc-multi-edit-item" key={index}>
                <button
                  type="button"
                  className="oc-multi-edit-head"
                  aria-label={`Edit ${index + 1}`}
                  aria-expanded={open}
                  onClick={() => setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })}
                >
                  <span className="oc-multi-edit-label">Edit {index + 1}</span>
                  <LineCounts {...(editCounts(edit) ?? { added: 0, removed: 0 })} />
                  <span className="oc-multi-edit-preview">{oldText.split("\n")[0]?.substring(0, 40) || "Empty"}{oldText.length > 40 ? "..." : ""}</span>
                </button>
                {open ? <div className="oc-multi-edit-body"><DiffBlock oldText={stripMarkers(oldText)} newText={stripMarkers(newText)} /></div> : null}
              </div>
            );
          })}
        </div>
      }
    />
  );
}

function BashRow({ input, output, ...shell }: ShellBase & { input: Record<string, unknown>; output?: string }) {
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

function NumberedCode({ text, start, language }: { text: string; start: number; language?: string }) {
  const lines = text.split("\n");
  return (
    <pre className="oc-tool-code numbered">
      {lines.map((l, i) => (
        <div key={i} className="oc-code-line">
          <span className="oc-code-ln">{start + i}</span>
          <span>{highlight(language, l) ?? l}</span>
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

// ---- The rest of Conductor's row kinds (renderApp `Tpo` ... `Kpo`, `aUt`) ---------

type ShellBase = { icon: ReactNode; open: boolean; onToggle: () => void; status?: ToolStatus };

/** `Mki`: a result that is a JSON array of text blocks, as its text. */
function textBlocks(result: string): string {
  try {
    const v: unknown = JSON.parse(result);
    if (Array.isArray(v)) return v.map((b) => (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : "")).join("\n");
  } catch {
    return result;
  }
  return result;
}

const RESULT_LIMIT = 100_000;

/** `V9e`: a call's input as JSON and its output (or error), the body of most generic rows. */
function InputOutput({ input, result, isError }: { input: Record<string, unknown>; result?: string; isError: boolean }) {
  const hasInput = Object.keys(input).length > 0;
  const text = result ?? "";
  const shown = text.length > RESULT_LIMIT ? text.slice(0, RESULT_LIMIT) : text;
  return (
    <div className="oc-io">
      {hasInput ? (
        <div>
          <div className="oc-io-label">Input:</div>
          <pre className="oc-io-pre muted">{JSON.stringify(input, null, 2)}</pre>
        </div>
      ) : null}
      {text ? (
        <div>
          {hasInput ? <div className="oc-io-label output">{isError ? "Error:" : "Output:"}</div> : null}
          <pre className={`oc-io-pre${isError ? " error" : ""}`}>{shown}</pre>
          {shown.length < text.length ? <div className="oc-io-truncated">Content truncated ({text.length.toLocaleString()} chars total)</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** `iUt`: an MCP tool's row; a failed call turns red and shows its error on the right. */
function McpRow({ name, input, result, isError, left, right, ...shell }: ShellBase & { name: string; input: Record<string, unknown>; result?: string; isError: boolean; left: ReactNode; right?: ReactNode }) {
  const error = isError && result !== undefined ? result.slice(0, RESULT_LIMIT) : undefined;
  const hasBody = Object.keys(input).length > 0 || !!result;
  return (
    <RowShell
      {...shell}
      left={left}
      right={error !== undefined ? <span className="oc-error-chip">{error}</span> : right}
      align="center"
      tone={error !== undefined ? "error" : undefined}
      content={
        hasBody ? (
          <div className="oc-io">
            <div className="oc-io-label mono">Tool: {name}</div>
            <InputOutput input={input} result={result} isError={isError} />
          </div>
        ) : undefined
      }
    />
  );
}

/** `Qu variant="outline"`: the small uppercase badge AskUserQuestion shows on the right. */
function Badge({ icon, children, tone }: { icon: LucideName; children: ReactNode; tone?: "destructive" | "muted" }) {
  return (
    <span className="oc-badge" data-tone={tone}>
      <Lucide name={icon} className="oc-badge-icon" />
      {children}
    </span>
  );
}

/** `t0`: the copy icon button (ExitPlanMode's plan, a sub-agent's result). */
function CopyIcon({ text, tooltip = "Copy" }: { text: string; tooltip?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="oc-copy-icon"
      aria-label={tooltip}
      title={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Lucide name={copied ? "check" : "copy"} className="oc-copy-icon-svg" />
    </button>
  );
}

/** `Q0o` + `oUt`: one task with its status icon. */
function TaskLine({ task }: { task: TaskItem }) {
  const icon: LucideName = task.status === "completed" ? "circle-check" : task.status === "in_progress" ? "clock" : task.status === "deleted" ? "trash-2" : "circle";
  return (
    <div className="oc-task" data-status={task.status ?? "pending"}>
      <Lucide name={icon} className="oc-task-icon" />
      <div className="oc-task-body">
        <p className="oc-task-subject">{task.subject}</p>
        {task.description ? <p className="oc-task-note">{task.description}</p> : null}
        {task.owner ? <p className="oc-task-note">Owner: {task.owner}</p> : null}
      </div>
    </div>
  );
}

const note = (text: string | undefined) => (text ? <span className="oc-tool-note">{text}</span> : undefined);

/** `bpo`'s model after the sub-agent type: Claude Code's aliases as Conductor names them (`IDt`). */
function modelName(model: string): string {
  const alias: Record<string, string> = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", inherit: "Inherit" };
  return alias[model] ?? model;
}

function ScheduleWakeupRow({ tool, status, result, resultCreatedAt, now = Date.now, isError, open, onToggle }: ToolRowProps) {
  const resultAt = resultCreatedAt === undefined ? undefined : Date.parse(resultCreatedAt);
  const wakeAt = scheduleWakeupAt(tool.input, result, resultAt);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (isError || wakeAt === undefined) return;
    const delay = wakeAt - now();
    if (delay <= 0) return;
    const timer = setTimeout(() => redraw((version) => version + 1), delay + 250);
    return () => clearTimeout(timer);
  }, [wakeAt, isError, now]);
  if (isError) return <GenericRow {...{ tool, status, result, isError, open, onToggle }} />;
  const label = scheduleWakeupLabel(tool.input, result, resultAt, now(), (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  return (
    <RowShell
      icon={<ToolIcon name={tool.name} />}
      open={open}
      onToggle={onToggle}
      status={status}
      left={<span>{label}</span>}
      right={s(tool.input.reason) ? <CodeChip text={s(tool.input.reason)} /> : undefined}
      align="center"
      content={<InputOutput input={tool.input} result={result} isError={isError} />}
    />
  );
}

function MoreRows({ tool, status, result, rawResult, resultCreatedAt, now, isError, open, onToggle, workspacePath, onOpenFile }: ToolRowProps) {
  const { name, input } = tool;
  const kind = toolKind(name);
  const shell: ShellBase = { icon: <ToolIcon name={name} />, open, onToggle, status };
  const framed = (text: string | undefined) => (text ? text : undefined);
  switch (kind) {
    case "bash-output": {
      // `N0o`
      const content = rawResult === undefined ? result : typeof rawResult === "string" ? rawResult : undefined;
      const st = backgroundStatus(content);
      return (
        <RowShell
          {...shell}
          left={
            <span className="oc-tool-left-row">
              Checking background process
              {st ? (
                <span className="oc-status-pill" data-status={st}>
                  {st}
                </span>
              ) : null}
            </span>
          }
          content={framed(content)}
        />
      );
    }
    case "ask-user-question": {
      // `Tpo`
      const questions = Array.isArray(input.questions) ? (input.questions as Record<string, unknown>[]) : [];
      const ask = askUserState(questions.length, result === undefined ? undefined : resultText(result), isError);
      const base = { ...shell, icon: <ToolIcon name="mcp__conductor__askuserquestion" />, left: <span>User input</span>, align: "center" as const };
      if (ask.state === "cancelled") return <RowShell {...base} right={<Badge icon="circle-x">Cancelled</Badge>} />;
      if (ask.state === "failed") return <RowShell {...base} right={<Badge icon="circle-x" tone="destructive">Failed</Badge>} content={ask.text || undefined} tone="error" />;
      if (ask.state === "waiting") {
        return status === "running" ? (
          <RowShell {...base} right={<Badge icon="clock">Awaiting response</Badge>} status={status} />
        ) : (
          <RowShell {...base} right={<Badge icon="circle" tone="muted">Not answered</Badge>} />
        );
      }
      return (
        <RowShell
          {...base}
          right={<Badge icon="circle-check">Answered</Badge>}
          content={
            <div className="oc-qa">
              {questions.map((q, i) => (
                <div key={i} className="oc-qa-item">
                  <div className="oc-qa-question">{s(q.question)}</div>
                  <div className="oc-qa-answer">{ask.answers[i]?.trim() ? ask.answers[i] : "No response"}</div>
                </div>
              ))}
            </div>
          }
        />
      );
    }
    case "enter-plan-mode":
      return <RowShell {...shell} left={<span>Enter plan mode</span>} />;
    case "exit-plan-mode": {
      const plan = s(input.plan);
      return (
        <RowShell
          {...shell}
          left={<span>Propose plan</span>}
          right={plan ? <CopyIcon text={plan} tooltip="Copy plan" /> : undefined}
          keepRight
          align="center"
          bareContent
          content={
            <div className="oc-plan">
              <Markdown text={plan} className="oc-prose" workspacePath={workspacePath} onOpenFile={onOpenFile} />
            </div>
          }
        />
      );
    }
    case "skill":
      return <RowShell {...shell} left={<span>{skillLabel(s(input.skill))}</span>} right={<span className="oc-tool-tag">Skill activated</span>} />;
    case "slash-command":
      return <RowShell {...shell} left={<span>{slashCommandLabel(s(input.command))}</span>} right={<span className="oc-tool-tag">Slash command</span>} />;
    case "thinking": {
      const text = s(input.thinking).trim();
      return (
        <RowShell
          {...shell}
          left={<span>Thinking</span>}
          right={<span className="oc-code-chip sans">{thinkingChipText(text)}</span>}
          align="center"
          plainContent
          content={
            <Markdown
              text={text}
              className="oc-prose muted"
              onOpenLink={(href) => void openUrl(href)}
              Link={LinkWithMenu}
            />
          }
        />
      );
    }
    case "task-create": {
      const subject = s(input.subject);
      const description = s(input.description);
      const id = taskIdIn(result);
      return (
        <RowShell
          {...shell}
          left={<span>Task created</span>}
          right={note(subject)}
          content={
            <div className="oc-task-detail">
              <p className="oc-task-subject">{subject}</p>
              {description ? <p className="oc-task-note">{description}</p> : null}
              {id ? <p className="oc-task-note mono">Task ID: {id}</p> : null}
            </div>
          }
        />
      );
    }
    case "task-list": {
      const tasks = parseTaskList(result);
      const active = tasks.find((t) => t.status === "in_progress");
      const done = tasks.filter((t) => t.status === "completed").length;
      const doing = tasks.filter((t) => t.status === "in_progress").length;
      const pending = tasks.filter((t) => t.status === "pending" || !t.status).length;
      const counts = [pending > 0 && `${pending} pending`, doing > 0 && `${doing} in progress`, done > 0 && `${done} completed`].filter(Boolean).join(", ");
      return (
        <RowShell
          {...shell}
          left={<span>{active ? "Task in progress" : "Task list"}</span>}
          right={<span className="oc-tool-count">{active ? active.activeForm || active.subject : `${done}/${tasks.length} completed`}</span>}
          content={
            <div>
              <div className="oc-task-counts">{counts}</div>
              {tasks.length === 0 ? (
                <p className="oc-task-empty">No tasks</p>
              ) : (
                <div className="oc-task-list">
                  {tasks.map((t, i) => (
                    <TaskLine key={t.id ?? i} task={t} />
                  ))}
                </div>
              )}
            </div>
          }
        />
      );
    }
    case "task-get": {
      const task = parseTask(result);
      const id = s(input.taskId);
      return (
        <RowShell
          {...shell}
          left={<span>Task details</span>}
          right={task ? note(task.subject) : id ? <span className="oc-tool-count mono">Task ID: {id}</span> : undefined}
          content={task ? <TaskLine task={task} /> : <p className="oc-task-empty">Loading task...</p>}
        />
      );
    }
    case "task-update": {
      const task = parseTask(result);
      const id = s(input.taskId) || taskIdIn(result);
      const { label, note: dep } = taskUpdateLabel(input);
      const subject = task?.subject || s(input.subject);
      const blockedBy = Array.isArray(input.addBlockedBy) ? (input.addBlockedBy as unknown[]).map(String) : [];
      const blocks = Array.isArray(input.addBlocks) ? (input.addBlocks as unknown[]).map(String) : [];
      const field = (k: string, v: ReactNode, mono = false) => (
        <div className="oc-task-field">
          <span className="oc-task-field-key">{k}</span>
          <span className={mono ? "oc-task-field-value mono" : "oc-task-field-value"}>{v}</span>
        </div>
      );
      return (
        <RowShell
          {...shell}
          left={<span>{label}</span>}
          right={dep ? note(dep) : subject ? note(task?.activeForm || subject) : id ? <span className="oc-tool-count mono">Task ID: {id}</span> : undefined}
          content={
            task ? (
              <TaskLine task={task} />
            ) : (
              <div className="oc-task-fields">
                {s(input.status) ? field("Status:", s(input.status)) : null}
                {s(input.subject) ? field("Subject:", s(input.subject)) : null}
                {blockedBy.length > 0 ? field("Blocked by:", `#${blockedBy.join(", #")}`, true) : null}
                {blocks.length > 0 ? field("Blocks:", `#${blocks.join(", #")}`, true) : null}
                {id ? <div className="oc-task-field id">Task ID: {id}</div> : null}
              </div>
            )
          }
        />
      );
    }
    case "teammate": {
      // `Gpo`
      const spawn = input.operation === "spawnTeam";
      const purpose = s(input.description);
      const lead = s(input.agent_type);
      return (
        <RowShell
          {...shell}
          left={<span>{spawn ? "Spawn swarm" : "Clean up swarm"}</span>}
          right={s(input.team_name) ? <CodeChip text={s(input.team_name)} /> : undefined}
          align="center"
          content={
            spawn && (purpose || lead) ? (
              <div className="oc-task-fields">
                {purpose ? (
                  <div>
                    <span className="oc-task-field-key">Purpose: </span>
                    <span className="oc-task-field-value">{purpose}</span>
                  </div>
                ) : null}
                {lead ? (
                  <div>
                    <span className="oc-task-field-key">Lead type: </span>
                    <span className="oc-task-field-value mono">{lead}</span>
                  </div>
                ) : null}
              </div>
            ) : undefined
          }
        />
      );
    }
    case "send-message": {
      // `qpo`
      const { label, summary } = sendMessageLabel(input);
      const recipient = s(input.recipient);
      const content = s(input.content);
      return (
        <RowShell
          {...shell}
          left={<span>{label}</span>}
          right={note(summary)}
          content={
            content ? (
              <div className="oc-task-fields">
                {recipient && input.type !== "broadcast" ? (
                  <div>
                    <span className="oc-task-field-key">To: </span>
                    <span className="oc-task-field-value mono">{recipient}</span>
                  </div>
                ) : null}
                <div className="oc-pre-wrap">{content}</div>
              </div>
            ) : undefined
          }
        />
      );
    }
    case "diff-comment": {
      // `Ipo`
      const comments = Array.isArray(input.comments) ? (input.comments as Record<string, unknown>[]) : [];
      return (
        <RowShell
          {...shell}
          left={<span>Code review comments</span>}
          right={<span className="oc-tool-count">{`${comments.length} comment${comments.length !== 1 ? "s" : ""}`}</span>}
          content={
            <div className="oc-qa">
              {comments.map((c, i) => (
                <div key={i} className="oc-comment">
                  <div className="oc-comment-where">
                    {s(c.file)}:{String(c.lineNumber ?? "")}
                  </div>
                  <div className="oc-qa-question body">{s(c.body)}</div>
                </div>
              ))}
            </div>
          }
        />
      );
    }
    case "get-diff-comments":
      return <RowShell {...shell} left={<span>Review comments</span>} right={<span className="oc-tool-count">{s(input.file) ? lastTwoSegments(s(input.file)) : "All files"}</span>} content={framed(result)} />;
    case "get-workspace-diff": {
      const target = input.stat ? "File stats" : s(input.file) ? lastTwoSegments(s(input.file)) : "Full diff";
      return <RowShell {...shell} left={<span>Workspace diff</span>} right={<span className="oc-tool-count">{target}</span>} content={framed(result)} />;
    }
    case "get-terminal-output": {
      const { text, note: where } = terminalOutput(input, result, rawResult);
      return <RowShell {...shell} left={<span>Get terminal output</span>} right={where ? <span className="oc-tool-count">{where}</span> : undefined} content={framed(text)} />;
    }
    case "schedule-wakeup":
      return <ScheduleWakeupRow {...{ tool, status, result, resultCreatedAt, now, isError, open, onToggle }} />;
    case "image-generation": {
      // `Vpo`: the generated image's path (the image itself is not drawn yet).
      const path = result === undefined ? "" : resultText(result).trim();
      const imageExtensions = { png: true, jpg: true, jpeg: true, gif: true, webp: true, tif: true, tiff: true, avif: true, bmp: true };
      const extension = path.split(".").pop()?.toLowerCase();
      const isCollapsible = extension !== undefined && Object.prototype.hasOwnProperty.call(imageExtensions, extension);
      return (
        <RowShell
          {...shell}
          left={<span>{result === undefined ? "Generating image" : "Generated image"}</span>}
          isCollapsible={isCollapsible}
          keepRight
          content={path ? <span className="oc-task-note mono">{path}</span> : undefined}
        />
      );
    }
    case "node-repl-js": {
      // `Kpo`
      const title = s(input.title);
      return (
        <RowShell
          {...shell}
          left={<span>Node REPL</span>}
          right={title ? <CodeChip text={title} /> : undefined}
          align="center"
          content={Object.keys(input).length > 0 || result ? <InputOutput input={input} result={result} isError={isError} /> : undefined}
        />
      );
    }
    case "linear-mcp":
    case "context7-mcp": {
      // `Bki` / `$ki`
      const chip =
        name === "mcp__linear__get_issue" ? s(input.id)
        : name === "mcp__context7__resolve-library-id" ? s(input.libraryName)
        : name === "mcp__context7__get-library-docs" ? s(input.topic)
        : "";
      return <McpRow {...shell} name={name} input={input} result={result} isError={isError} left={<span>{mcpLabel(name)}</span>} right={chip ? <CodeChip text={chip} /> : undefined} />;
    }
    case "codex-collab":
      return <CollabRow name={name} input={input} result={result} isError={isError} />;
    case "sub-agent":
      if (isTypedSubagent(input)) return <SubagentRow {...shell} input={input} result={result} />;
      if (name.startsWith("mcp__linear__") || name.startsWith("mcp__context7__")) return <MoreRows {...{ tool, status, result, resultCreatedAt, now, isError, open, onToggle, workspacePath, onOpenFile }} />;
      return <GenericRow {...{ tool, status, result, isError, open, onToggle }} />;
    default:
      return <GenericRow {...{ tool, status, result, rawResult, isError, open, onToggle }} />;
  }
}

/** `aUt`: any other tool. MCP tools get `iUt`'s shell; Monitor shows its description as plain text. */
function GenericRow({ tool, status, result, rawResult, isError, open, onToggle }: Pick<ToolRowProps, "tool" | "status" | "result" | "rawResult" | "isError" | "open" | "onToggle">) {
  const { name, input } = tool;
  const shell: ShellBase = { icon: <ToolIcon name={name} />, open, onToggle, status };
  const mcp = name.startsWith("mcp__");
  let output = result;
  if (!mcp && rawResult !== undefined) output = typeof rawResult === "string" ? rawResult : rawResult ? JSON.stringify(rawResult, null, 2) : "";
  const monitor = name === "Monitor";
  const summary = genericSummary(name, input);
  const left = mcp || monitor || name === "ToolSearch" ? <span>{mcpLabel(name)}</span> : <span className="oc-lowercase">{name}</span>;
  const right = summary ? monitor ? <span className="oc-tool-plain">{summary}</span> : <CodeChip text={summary} /> : undefined;
  if (mcp) return <McpRow {...shell} name={name} input={input} result={result} isError={isError} left={left} right={right} />;
  return (
    <RowShell
      {...shell}
      left={left}
      leftClass={monitor ? "shrink" : undefined}
      right={right}
      align={monitor ? "baseline" : "center"}
      content={Object.keys(input).length > 0 || output ? <InputOutput input={input} result={output} isError={isError} /> : undefined}
    />
  );
}

/** `bpo`: a typed sub-agent (Explore, Plan, ...): its type and model, its description, its answer. */
function SubagentRow({ input, result, ...shell }: ShellBase & { input: Record<string, unknown>; result?: string }) {
  const [raw, setRaw] = useState(false);
  const type = s(input.subagent_type);
  const model = s(input.model);
  const description = subagentDescription(s(input.description), model || undefined);
  const text = result === undefined ? "" : resultText(result);
  return (
    <RowShell
      {...shell}
      icon={<ToolIcon name={type} />}
      left={
        <span className="oc-subagent-type">
          {type}
          {model ? (
            <>
              <span className="oc-subagent-dot">{"\u2022"}</span>
              <span className="oc-subagent-model">{modelName(model)}</span>
            </>
          ) : null}
        </span>
      }
      right={description ? <span className="oc-tool-count">{description}</span> : undefined}
      plainContent
      content={
        text ? (
          <div className="oc-subagent-result">
            <div className="oc-subagent-tabs">
              <div className="oc-subagent-tab-group">
                <button type="button" className={raw ? "oc-subagent-tab" : "oc-subagent-tab active"} onClick={() => setRaw(false)}>
                  Formatted
                </button>
                <button type="button" className={raw ? "oc-subagent-tab active" : "oc-subagent-tab"} onClick={() => setRaw(true)}>
                  Raw
                </button>
              </div>
              <CopyIcon text={text} />
            </div>
            <div className="oc-subagent-body">{raw ? <div className="oc-subagent-raw">{text}</div> : <Markdown text={text} className="oc-prose" onOpenLink={(href) => void openUrl(href)} Link={LinkWithMenu} />}</div>
          </div>
        ) : undefined
      }
    />
  );
}

const COLLAB_COLORS = ["blue", "green", "cyan", "fuchsia", "orange", "yellow"];

function CollabAgentName({ agent }: { agent: CollabAgent }) {
  return (
    <span className="oc-collab-agent">
      <span className="oc-collab-name" data-color={COLLAB_COLORS[agent.color]}>
        {agent.name}
      </span>
      {agent.role ? <span className="oc-collab-role">{agent.role}</span> : null}
    </span>
  );
}

/** `_0o` in `Rki`'s shell: a Codex collaboration call (spawn, wait, send input ... to agents). */
function CollabRow({ name, input, result, isError }: { name: string; input: Record<string, unknown>; result?: string; isError: boolean }) {
  const [open, setOpen] = useState(false);
  const call = collabCall(name, input, result, isError);
  const body =
    call.prompt || call.listAgents ? (
      <div className="oc-collab-body">
        {call.prompt ? <div className="oc-collab-prompt">{call.prompt}</div> : null}
        {call.listAgents
          ? call.agents.map((a) => (
              <div key={a.threadId} className="oc-collab-line">
                <CollabStatus status={a.errored ? "failed" : call.status} />
                <span>
                  <CollabAgentName agent={a} />
                  {a.state ? <span className="oc-collab-state">{`: ${a.state}`}</span> : null}
                </span>
              </div>
            ))
          : null}
      </div>
    ) : null;
  const statusIcon =
    call.status === "failed" ? <Lucide name="circle-alert" className="oc-tool-icon error" />
    : call.status === "completed" ? <Lucide name="bot" className="oc-tool-icon" />
    : <Lucide name="bot" className="oc-tool-icon working" />;
  return (
    <div className="oc-tool oc-collab" data-status={call.status}>
      <div className={`oc-tool-head${body ? " opens" : ""}`} onClick={body ? () => setOpen((o) => !o) : undefined} role={body ? "button" : undefined} aria-expanded={body ? open : undefined}>
        <div className="oc-tool-icon-slot">
          {body ? (
            <div className="oc-tool-icon-swap">
              <div className="oc-tool-icon-idle">{statusIcon}</div>
              <Lucide name={open ? "minus" : "plus"} className="oc-tool-icon-hover" />
            </div>
          ) : (
            statusIcon
          )}
        </div>
        <div className="oc-tool-main align-baseline">
          <span className="oc-collab-title">
            <span className="oc-collab-action">{call.action}</span>
            {call.agents.length === 1 ? <CollabAgentName agent={call.agents[0]!} /> : <span className="oc-collab-count">{call.countLabel}</span>}
            {call.model ? (
              <>
                <span className="oc-subagent-dot">{"\u2022"}</span>
                <span className="oc-subagent-model">{modelName(call.model)}</span>
              </>
            ) : null}
          </span>
        </div>
      </div>
      {open && body ? <div className="oc-collab-children">{body}</div> : null}
    </div>
  );
}

function CollabStatus({ status }: { status: "inProgress" | "completed" | "failed" }) {
  return <Lucide name={status === "completed" ? "circle-check" : status === "failed" ? "circle-alert" : "clock"} className={`oc-tool-icon${status === "failed" ? " error" : ""}`} />;
}
