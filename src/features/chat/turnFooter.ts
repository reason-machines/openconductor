// The turn footer's "8m, 0s · 10:37 AM" (Conductor renderApp `$Pt` and `SDo`). Pure.

/** `$Pt(ms, { showTenths: false })`: "8m, 0s" or "42s". */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m, ${s}s` : `${s}s`;
}

/** `SDo`: the end time today, a weekday within 6 days, else the date (and year when not this year). */
export function formatEndTime(end: number, now: number): string {
  const e = new Date(end);
  const n = new Date(now);
  const time = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(n) - day(e)) / 86_400_000);
  if (days === 0) return time;
  if (days > 0 && days < 7) return `${e.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return `${e.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(e.getFullYear() === n.getFullYear() ? {} : { year: "numeric" }) })}, ${time}`;
}

export function footerTime(startedAt: string | undefined, endedAt: string | undefined, now: number): string | undefined {
  if (!startedAt || !endedAt) return undefined;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return `${formatDuration(Math.max(0, end - start))} · ${formatEndTime(end, now)}`;
}
