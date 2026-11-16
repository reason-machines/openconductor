// Conductor's shell integration marks (`ESC]633;Conductor;…`, written by the
// zsh files in src-tauri/src/terminal/shell_integration.rs): strip them from
// terminal output and track the running program and finished commands.
// Mirrors the reference's index chunk: `xkt`/`Pkt` (byte 2754392), the
// controller update `lbt`/`ubt`/`dbt` (2563449-2566300) and its call in
// `handleData` (2767724). Pure: no xterm, no DOM.

const OSC = "\x1b]";
const BEL = "\x07";
const ST = "\x1b\\";
const PREFIX = `${OSC}633;Conductor;`;

export type ShellMark =
  | { type: "prompt" }
  | { type: "program_start"; markerId: string; program: string; command?: string }
  | { type: "command_done"; markerId: string };

export type Segment = { type: "data"; data: string } | { type: "event"; event: ShellMark };

/** `Prompt`, `ProgramStart;<id>;<program>[;<command>]`, `CommandDone;<id>`; anything else is not a mark. */
export function parseMark(body: string): ShellMark | undefined {
  if (body === "Prompt") return { type: "prompt" };
  if (body.startsWith("CommandDone;")) {
    const markerId = body.slice("CommandDone;".length);
    return markerId ? { type: "command_done", markerId } : undefined;
  }
  if (!body.startsWith("ProgramStart;")) return undefined;
  const rest = body.slice("ProgramStart;".length);
  const i = rest.indexOf(";");
  if (i === -1) return undefined;
  const markerId = rest.slice(0, i);
  const tail = rest.slice(i + 1);
  const j = tail.indexOf(";");
  const program = j === -1 ? tail : tail.slice(0, j);
  const command = j === -1 ? undefined : tail.slice(j + 1);
  if (!markerId || !program) return undefined;
  return { type: "program_start", markerId, program, command: command || undefined };
}

/**
 * Split one chunk of output into text and marks. As in the reference, each
 * chunk stands alone: a mark with no BEL or ST terminator in the same chunk is
 * passed through as text (xterm ignores the unknown OSC either way), and an
 * unrecognised `633;Conductor;` sequence is passed through whole.
 */
export function splitMarks(text: string): { sanitized: string; segments: Segment[] } {
  const segments: Segment[] = [];
  let sanitized = "";
  const data = (s: string) => {
    sanitized += s;
    if (s.length > 0) segments.push({ type: "data", data: s });
  };
  let at = 0;
  while (at < text.length) {
    const start = text.indexOf(PREFIX, at);
    if (start === -1) {
      data(text.slice(at));
      break;
    }
    data(text.slice(at, start));
    const bodyAt = start + PREFIX.length;
    const bel = text.indexOf(BEL, bodyAt);
    const st = text.indexOf(ST, bodyAt);
    const end = [bel, st].filter((x) => x !== -1).sort((a, b) => a - b)[0];
    if (end === undefined) {
      data(text.slice(start));
      break;
    }
    const mark = parseMark(text.slice(bodyAt, end));
    const term = end === st ? ST : BEL;
    if (mark) segments.push({ type: "event", event: mark });
    else {
      data(text.slice(start, end));
      data(term);
    }
    at = end + term.length;
  }
  return { sanitized, segments };
}

export interface ActiveCommand {
  command: string;
  markerId: string;
  program: string;
  output: string;
  outputByteLength: number;
}

export interface CompletedCommand {
  command: string;
  markerId: string;
  program: string;
  output: string;
  completedAt: string;
}

export interface ShellState {
  activeCommand?: ActiveCommand;
  completedCommands: CompletedCommand[];
  runningProgram?: string;
  completedCommandMarkerId?: string;
  hasObservedPromptMarker: boolean;
}

/** The reference's limits: 1 MiB of output kept for the running command, the last 5 finished commands. */
export const MAX_ACTIVE_OUTPUT_BYTES = 1024 * 1024;
export const MAX_COMPLETED_COMMANDS = 5;

export const emptyShellState = (): ShellState => ({ completedCommands: [], hasObservedPromptMarker: false });

const encoder = new TextEncoder();
const byteLength = (s: string) => encoder.encode(s).byteLength;

/** Append output, keeping the longest suffix that fits in `max` UTF-8 bytes. */
export function appendOutput(output: string, outputBytes: number, next: string, max: number): { output: string; outputByteLength: number } {
  const all = output + next;
  const bytes = outputBytes + byteLength(next);
  if (bytes <= max) return { output: all, outputByteLength: bytes };
  let lo = 0;
  let hi = all.length;
  let cut = all.length;
  let kept = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const n = byteLength(all.slice(mid));
    if (n <= max) {
      cut = mid;
      kept = n;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return { output: all.slice(cut), outputByteLength: kept };
}

/**
 * Apply one chunk's segments to `state` in place; returns whether anything a
 * viewer shows changed (running program, completed marker, finished commands).
 */
export function applySegments(
  state: ShellState,
  segments: Segment[],
  now: () => string = () => new Date().toISOString(),
  maxOutputBytes = MAX_ACTIVE_OUTPUT_BYTES,
  maxCompleted = MAX_COMPLETED_COMMANDS,
): boolean {
  let changed = false;
  const finish = (markerId: string): boolean => {
    const a = state.activeCommand;
    if (!a || a.markerId !== markerId) return false;
    state.activeCommand = undefined;
    state.completedCommands = [
      { command: a.command, markerId, output: a.output, program: a.program, completedAt: now() },
      ...state.completedCommands,
    ].slice(0, maxCompleted);
    return true;
  };
  for (const s of segments) {
    if (s.type === "data") {
      const a = state.activeCommand;
      if (a) Object.assign(a, appendOutput(a.output, a.outputByteLength, s.data, maxOutputBytes));
      continue;
    }
    const e = s.event;
    if (e.type === "prompt") {
      state.hasObservedPromptMarker = true;
      if (state.activeCommand) {
        finish(state.activeCommand.markerId);
        changed = true;
      }
      if (state.runningProgram !== undefined) {
        state.runningProgram = undefined;
        changed = true;
      }
      continue;
    }
    if (e.type === "command_done") {
      if (state.completedCommandMarkerId !== e.markerId) {
        state.completedCommandMarkerId = e.markerId;
        changed = true;
      }
      if (finish(e.markerId)) changed = true;
      continue;
    }
    if (state.activeCommand) {
      finish(state.activeCommand.markerId);
      changed = true;
    }
    state.activeCommand = { command: e.command ?? e.program, markerId: e.markerId, output: "", outputByteLength: 0, program: e.program };
    if (state.runningProgram !== e.program || state.completedCommandMarkerId !== undefined) {
      state.runningProgram = e.program;
      state.completedCommandMarkerId = undefined;
      changed = true;
    }
  }
  return changed;
}

/** The reference's tab label: "Terminal N", plus " (program)" while one runs. */
export const tabLabel = (title: string, runningProgram?: string): string =>
  runningProgram ? `${title} (${runningProgram})` : title;
