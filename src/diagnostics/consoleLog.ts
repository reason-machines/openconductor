// "Copy all console logs" on the Diagnostics page. Conductor's button copies
// its app log (`export_app_logs`, tauri-plugin-log over backend and frontend),
// trimmed to the last 500,000 bytes at a line boundary (`xoa`, `yoa` in the
// decoded renderApp-D_fmY7hW.js). OpenConductor keeps no app log file, so it
// copies what the frontend console printed this session instead: every
// console.debug/log/info/warn/error line since startup, timestamped, in a
// buffer capped at the same 500,000 bytes.

/** `yoa`. */
export const LOG_LIMIT_BYTES = 500_000;

/** `xoa`: the last `limit` bytes of `text`, starting after the first newline in them. */
export function tailBytes(text: string, limit = LOG_LIMIT_BYTES): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limit) return text;
  const tail = bytes.slice(bytes.length - limit);
  const nl = tail.indexOf(10);
  return new TextDecoder().decode(nl >= 0 ? tail.slice(nl + 1) : tail);
}

type Level = "debug" | "log" | "info" | "warn" | "error";
const LEVELS: readonly Level[] = ["debug", "log", "info", "warn", "error"];

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/** One log line: `<ISO time> [LEVEL] args…`. */
export function formatLine(level: Level, args: readonly unknown[], at: Date): string {
  return `${at.toISOString()} [${level.toUpperCase()}] ${args.map(formatArg).join(" ")}`;
}

/** A line buffer that drops its oldest lines past `limit` bytes (approximated by UTF-16 length). */
export class LogBuffer {
  private lines: string[] = [];
  private size = 0;
  private readonly limit: number;
  constructor(limit = LOG_LIMIT_BYTES) {
    this.limit = limit;
  }
  push(line: string): void {
    this.lines.push(line);
    this.size += line.length + 1;
    while (this.size > this.limit * 2 && this.lines.length > 1) this.size -= this.lines.shift()!.length + 1;
  }
  text(): string {
    return tailBytes(this.lines.join("\n"), this.limit);
  }
}

const buffer = new LogBuffer();
let installed = false;

/** Mirrors every console call into the buffer; idempotent. */
export function installConsoleCapture(target: Console = console): void {
  if (installed) return;
  installed = true;
  for (const level of LEVELS) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      try {
        buffer.push(formatLine(level, args, new Date()));
      } catch {
        /* logging must never throw */
      }
      original(...args);
    };
  }
}

/** The captured console output, at most LOG_LIMIT_BYTES. */
export function exportConsoleLogs(): string {
  return buffer.text();
}
