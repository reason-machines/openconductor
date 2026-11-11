// Payloads of the `pty-event` channel (src-tauri/src/terminal/wire.rs) and
// the renderer's byte acks for flow control. Pure: no Tauri, no DOM.

export const PTY_EVENT = "pty-event";

export type PtyEvent =
  | { kind: "ready"; id: string; pid: number | null }
  | { kind: "data"; id: string; data: Uint8Array }
  | { kind: "exit"; id: string; exitCode: number; signal: string | null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Validate and decode one event; throws on a malformed payload. */
export function parsePtyEvent(payload: unknown): PtyEvent {
  const p = isObj(payload) ? payload : {};
  const kind = p.kind;
  const id = p.id;
  if (typeof id !== "string") throw new Error(`Invalid PTY ${String(kind)} payload`);
  if (kind === "ready" && (p.pid === null || p.pid === undefined || typeof p.pid === "number")) {
    return { kind, id, pid: (p.pid as number | null | undefined) ?? null };
  }
  if (kind === "data" && typeof p.data === "string") return { kind, id, data: decodeBase64(p.data) };
  if (kind === "exit" && typeof p.exitCode === "number" && (p.signal == null || typeof p.signal === "string")) {
    return { kind, id, exitCode: p.exitCode, signal: (p.signal as string | null | undefined) ?? null };
  }
  throw new Error(`Invalid PTY ${String(kind)} payload`);
}

export function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Batches acks of rendered bytes. Acks go out once `threshold` bytes are
 * pending, or `delayMs` after the last rendered chunk, so a quiet terminal
 * never leaves bytes unacked (the backend pauses at its high watermark).
 */
type Timer = ReturnType<typeof setTimeout>;

export class AckBatcher {
  private pending = 0;
  private timer: Timer | null = null;
  private readonly send: (bytes: number) => void;
  private readonly threshold: number;
  private readonly delayMs: number;
  private readonly schedule: (f: () => void, ms: number) => Timer;
  private readonly cancel: (t: Timer) => void;

  constructor(
    send: (bytes: number) => void,
    threshold = 32 * 1024,
    delayMs = 30,
    schedule: (f: () => void, ms: number) => Timer = setTimeout,
    cancel: (t: Timer) => void = clearTimeout,
  ) {
    this.send = send;
    this.threshold = threshold;
    this.delayMs = delayMs;
    this.schedule = schedule;
    this.cancel = cancel;
  }

  /** `n` more bytes have been drawn. */
  rendered(n: number): void {
    this.pending += n;
    if (this.pending >= this.threshold) this.flush();
    else if (this.timer === null) {
      // Called unbound: browsers throw "Illegal invocation" when setTimeout
      // gets another `this`, which would wedge xterm's write queue.
      const schedule = this.schedule;
      this.timer = schedule(() => this.flush(), this.delayMs);
    }
  }

  flush(): void {
    const cancel = this.cancel;
    if (this.timer !== null) cancel(this.timer);
    this.timer = null;
    if (this.pending > 0) this.send(this.pending);
    this.pending = 0;
  }
}
