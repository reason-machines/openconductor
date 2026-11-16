// The turn footer's "8m, 0s · 10:37 AM": how long the turn ran and when it
// ended, with "start → end" on hover. Ported from Conductor's renderer
// (renderApp.js `$Pt`, `SDo`, `OX`, used by the turn footer with
// `showTenths: false`); see evidence/parity/chat-diff-pr/README.md.

const DAY_MS = 24 * 60 * 60 * 1000;

/** `$Pt`: "42s", "8m, 0s"; with tenths "8m, 0.3s". Minutes never roll into hours. */
export function formatTurnDuration(ms: number, { showTenths = false }: { showTenths?: boolean } = {}): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  const s = showTenths ? `${seconds}.${tenths}s` : `${seconds}s`;
  return minutes > 0 ? `${minutes}m, ${s}` : s;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function turnDayClock(now: () => number = Date.now) {
  return {
    getSnapshot: () => startOfDay(new Date(now())),
    subscribe(onChange: () => void) {
      let active = true;
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        const current = now();
        const date = new Date(current);
        const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
        timer = setTimeout(() => {
          if (!active) return;
          onChange();
          if (active) schedule();
        }, Math.max(nextDay - current, 1000));
      };
      schedule();
      return () => { active = false; clearTimeout(timer); };
    },
  };
}

/** `SDo`: "10:37 AM" today, "Tue 10:37 AM" within the week, else "Nov 3, 10:37 AM" (year when it differs). */
export function formatTurnEnd(at: string | number, now: number = Date.now(), locale?: string): string {
  const d = new Date(at);
  const today = new Date(now);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true });
  const days = Math.round((startOfDay(today) - startOfDay(d)) / DAY_MS);
  if (days === 0) return time;
  if (days > 0 && days < 7) return `${d.toLocaleDateString(locale, { weekday: "short" })} ${time}`;
  const sameYear = d.getFullYear() === today.getFullYear();
  return `${d.toLocaleDateString(locale, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}, ${time}`;
}

/** `OX`: "Nov 5, 2026, 10:29 AM", used for the hover's "start → end". */
export function formatTurnInstant(at: string | number, locale?: string): string {
  const d = new Date(at);
  const date = d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

export interface TurnTimeView {
  /** "8m, 0s · 10:37 AM" */
  label: string;
  /** "Nov 5, 2026, 10:29 AM → Nov 5, 2026, 10:37 AM" */
  range: string;
}

/** The footer's time, or nothing when the turn lacks either end (older transcripts). */
export function turnTime(startedAt: string | undefined, endedAt: string | undefined, now: number = Date.now(), locale?: string): TurnTimeView | undefined {
  if (startedAt === undefined || endedAt === undefined) return undefined;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return {
    label: `${formatTurnDuration(Math.max(0, end - start))} \u00b7 ${formatTurnEnd(end, now, locale)}`,
    range: `${formatTurnInstant(start, locale)} \u2192 ${formatTurnInstant(end, locale)}`,
  };
}
