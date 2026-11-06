// Routines: Conductor's /routines (its "automations", renderApp-D_fmY7hW.js
// @11,404,000-11,520,000) on Reason Loops instead of Conductor's cloud API.
//
// A Conductor automation has a name, a prompt, a repository, an agent model,
// an enabled switch and up to 20 triggers (cron, GitHub pull request event,
// webhook). A Reason Loop (public API `createReasonLoop` / `getReasonLoop`,
// `reason tools describe`, CLI 0.2.673) has a name, a prompt, a model,
// `enabled`, and `wake_on`: at most one schedule, one webhook, and GitHub
// events on one repository. This module maps one onto the other and holds
// Conductor's labels and rules. Pure: no React, no Tauri (model.test.ts).
//
// Where they differ (evidence/routines/README.md):
// - A Loop has no repository field for a schedule or webhook; the routine's
//   repository goes into the prompt's first line (`Repository: owner/name`)
//   and is read back from there or from a GitHub wake's `repository`.
// - Reads give a GitHub wake's words (`wakes_on[].description`), not its
//   fields, so the event is recovered from those words.
// - Reason's GitHub filters are label, author and title; there is no base
//   branch filter and no "is not".
// - "PR merged" wakes on Reason's `pr_closed`, which includes closed
//   unmerged pull requests.
// - No run history (only `last_run` and `run_count`), no versions, no
//   archive, no created date.

/** Conductor's trigger GitHub events (`ett`) and their menu labels (`THi`). */
export const GITHUB_EVENTS = ["pull_request_opened", "pull_request_pushed", "pull_request_merged"] as const;
export type GithubEvent = (typeof GITHUB_EVENTS)[number];
export const GITHUB_EVENT_LABEL: Record<GithubEvent, string> = {
  pull_request_opened: "PR opened",
  pull_request_pushed: "PR pushed",
  pull_request_merged: "PR merged",
};
/** The trigger row's event select (`AHi`). */
export const GITHUB_EVENT_SHORT: Record<GithubEvent, string> = { pull_request_opened: "opened", pull_request_pushed: "pushed", pull_request_merged: "merged" };
/** Reason's GitHub wake event for each (`LoopGithubWake.github.event`). */
export const REASON_GITHUB_EVENT: Record<GithubEvent, string> = {
  pull_request_opened: "pr_opened",
  pull_request_pushed: "pr_pushed",
  pull_request_merged: "pr_closed",
};

/** Filter fields Reason can apply (Conductor's `AX` also has base_branch). */
export const FILTER_FIELDS = ["label", "author"] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];
export const FILTER_LABEL: Record<FilterField, string> = { label: "Label", author: "Author" };
export interface Filter {
  field: FilterField;
  value: string;
}

export type Trigger =
  | { id: string; type: "cron"; cronExpression: string }
  | { id: string; type: "github"; githubEvent: GithubEvent; filters: Filter[] }
  | { id: string; type: "webhook"; webhookUrl?: string }
  /** A wake OpenConductor cannot edit (Slack, an interval, a one-time time): kept as it is. */
  | { id: string; type: "other"; kind: string; description: string };

/** A routine as the pages show it. */
export interface Routine {
  /** The Loop's id. */
  id: string;
  /** The Reason the Loop is filed under. */
  reasonId: string;
  name: string;
  prompt: string;
  /** `owner/name`, or undefined. */
  repository?: string;
  /** Reason model id; undefined runs Auto. */
  model?: string;
  enabled: boolean;
  status: "active" | "paused" | "completed" | "failed";
  pausedReason?: string;
  ownerUserId: string;
  runCount: number;
  lastRun?: { status: string; at: string; sessionId: string };
  nextRunAt?: string;
  timezone?: string;
  triggers: Trigger[];
  canEdit: boolean;
  canStop: boolean;
}

/** The editor's draft. */
export interface RoutineDraft {
  name: string;
  prompt: string;
  repository?: string;
  model?: string;
  enabled: boolean;
  triggers: Trigger[];
}

const REPO_LINE = /^Repository: ([\w.-]+\/[\w.-]+)\n\n?/;

/** The prompt a Loop follows: the repository line, then the routine's prompt. */
export function loopPrompt(prompt: string, repository?: string): string {
  return repository ? `Repository: ${repository}\n\n${prompt}` : prompt;
}

/** Splits a Loop's prompt back into the repository line and the routine's prompt. */
export function splitPrompt(prompt: string): { prompt: string; repository?: string } {
  const m = REPO_LINE.exec(prompt);
  return m ? { prompt: prompt.slice(m[0].length), repository: m[1] } : { prompt };
}

/** Reason's GitHub event in a wake's words, back to Conductor's. */
export function githubEventFromWords(words: string): GithubEvent | undefined {
  const w = words.toLowerCase();
  if (/pr_opened|pr_reopened|pull request opened|\bopened\b/.test(w)) return "pull_request_opened";
  if (/pr_pushed|\bpushed\b|\bpush\b/.test(w)) return "pull_request_pushed";
  if (/pr_closed|\bmerged\b|\bclosed\b/.test(w)) return "pull_request_merged";
  return undefined;
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

/** A `ReasonLoop` from the API as a routine. */
export function routineFromLoop(raw: unknown): Routine {
  const l = obj(raw);
  const id = str(l.id) ?? "";
  const { prompt, repository: fromPrompt } = splitPrompt(str(l.prompt) ?? "");
  const schedule = obj(l.schedule);
  const trigger = obj(l.event_trigger);
  const triggers: Trigger[] = [];
  const wakes = Array.isArray(l.wakes_on) ? l.wakes_on.map(obj) : [];
  wakes.forEach((w, i) => {
    const tid = `${id}-${i}`;
    const kind = str(w.kind) ?? "";
    const words = str(w.description) ?? "";
    if (kind === "schedule" && schedule.kind === "cron" && str(schedule.expression)) triggers.push({ id: tid, type: "cron", cronExpression: str(schedule.expression)! });
    else if (kind === "webhook") triggers.push({ id: tid, type: "webhook", webhookUrl: str(trigger.url) });
    else if (kind === "github" && githubEventFromWords(words)) triggers.push({ id: tid, type: "github", githubEvent: githubEventFromWords(words)!, filters: [] });
    else triggers.push({ id: tid, type: "other", kind, description: words || kind });
  });
  const last = obj(l.last_run);
  const access = obj(l.viewer_access);
  const status = str(l.status);
  return {
    id,
    reasonId: str(l.reason_id) ?? "",
    name: str(l.name) ?? "",
    prompt,
    repository: str(l.repository) ?? fromPrompt,
    model: str(l.model) && l.model !== "auto" ? str(l.model) : undefined,
    enabled: l.enabled === true,
    status: status === "paused" || status === "completed" || status === "failed" ? status : "active",
    pausedReason: str(l.paused_reason),
    ownerUserId: str(l.created_by_user_id) ?? "",
    runCount: typeof l.run_count === "number" ? l.run_count : 0,
    lastRun: str(last.at) ? { status: str(last.status) ?? "", at: str(last.at)!, sessionId: str(last.session_id) ?? "" } : undefined,
    nextRunAt: str(schedule.next_run_at),
    timezone: str(schedule.timezone),
    triggers,
    canEdit: access.edit !== false,
    canStop: access.stop !== false,
  };
}

/**
 * What still blocks saving, in Conductor's words where it has them (its
 * "Routine isn't ready: …" toast joins these with "; ").
 */
export function draftProblems(d: RoutineDraft): string[] {
  const out: string[] = [];
  if (!d.prompt.trim()) out.push("add a prompt");
  const crons = d.triggers.filter((t) => t.type === "cron");
  if (crons.some((t) => t.type === "cron" && !isValidCron(t.cronExpression))) out.push("enter a valid cron expression");
  if (crons.length > 1) out.push("Reason runs one schedule per routine");
  if (d.triggers.filter((t) => t.type === "webhook").length > 1) out.push("Reason gives one webhook per routine");
  const github = d.triggers.filter((t) => t.type === "github");
  if (github.length && !d.repository) out.push("select a repository for the GitHub trigger");
  for (const t of github)
    if (t.type === "github") {
      if (t.filters.filter((f) => f.field === "label").length > 1) out.push("Reason filters on one label");
      if (t.filters.some((f) => !f.value.trim())) out.push(`GitHub trigger ${t.filters.find((f) => !f.value.trim())!.field} filter has no value`);
    }
  if (d.triggers.filter((t) => t.type !== "other").length === 0) out.push("add a trigger");
  return out;
}

/** The `wake_on` list of a draft (`LoopScheduleWake`, `LoopWebhookWake`, `LoopGithubWake`). */
export function wakeOn(d: RoutineDraft): Json[] {
  const out: Json[] = [];
  for (const t of d.triggers) {
    if (t.type === "cron") out.push({ schedule: t.cronExpression.trim() });
    else if (t.type === "webhook") out.push({ webhook: {} });
    else if (t.type === "github") {
      const filters: Json = {};
      const label = t.filters.find((f) => f.field === "label")?.value.trim();
      const authors = t.filters.filter((f) => f.field === "author").map((f) => f.value.trim());
      if (label) filters.label = label;
      if (authors.length) filters.author = authors;
      out.push({ github: { repo: d.repository, event: REASON_GITHUB_EVENT[t.githubEvent], ...(Object.keys(filters).length ? { filters } : {}) } });
    }
  }
  return out;
}

/** Body of `createReasonLoop`. */
export function createBody(d: RoutineDraft, timezone: string): Json {
  return {
    name: d.name.trim() || "Untitled routine",
    prompt: loopPrompt(d.prompt.trim(), d.repository),
    enabled: d.enabled,
    timezone,
    execution_mode: "new_session",
    wake_on: wakeOn(d),
    ...(d.model ? { model: d.model } : {}),
  };
}

const triggerKey = (t: Trigger) =>
  t.type === "cron" ? `cron:${t.cronExpression.trim()}` : t.type === "github" ? `github:${t.githubEvent}:${JSON.stringify(t.filters)}` : t.type === "webhook" ? "webhook" : `other:${t.description}`;

/**
 * The `updateReasonLoop` bodies that turn `saved` into `d`, in order. Reason
 * takes `wake_on` only with name, prompt and model, so `enabled` goes in a
 * second request; an unchanged draft sends nothing.
 */
export function updateBodies(saved: Routine, d: RoutineDraft): Json[] {
  const body: Json = {};
  if ((d.name.trim() || "Untitled routine") !== saved.name) body.name = d.name.trim() || "Untitled routine";
  if (d.prompt.trim() !== saved.prompt.trim() || d.repository !== saved.repository) body.prompt = loopPrompt(d.prompt.trim(), d.repository);
  if ((d.model ?? null) !== (saved.model ?? null)) body.model = d.model ?? null;
  const triggersChanged = d.repository !== saved.repository || d.triggers.map(triggerKey).join("|") !== saved.triggers.map(triggerKey).join("|");
  if (triggersChanged) body.wake_on = wakeOn(d);
  const out: Json[] = [];
  if (Object.keys(body).length) out.push(body);
  if (d.enabled !== saved.enabled) out.push({ enabled: d.enabled });
  return out;
}

export function draftOf(r: Routine): RoutineDraft {
  return { name: r.name, prompt: r.prompt, repository: r.repository, model: r.model, enabled: r.enabled, triggers: r.triggers };
}

export const EMPTY_DRAFT: RoutineDraft = { name: "", prompt: "", enabled: true, triggers: [] };

// ---------- schedules (Conductor's `itt`, `M8a`, `x8a`, `w8a`)

export const SCHEDULE_PRESETS = ["hourly", "daily", "weekdays", "weekly", "custom"] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];
export const SCHEDULE_PRESET_LABEL: Record<SchedulePreset, string> = { hourly: "Hourly", daily: "Daily", weekdays: "Weekdays", weekly: "Weekly", custom: "Custom (cron)" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Schedule =
  | { kind: "hourly" }
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekly"; weekday: number; time: string }
  | { kind: "custom" };

const pad = (n: number) => String(n).padStart(2, "0");
const minuteOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= 59;
const hourOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= 23;

/** Which preset a cron expression is, Conductor's `itt` (times are read in the routine's time zone). */
export function parseSchedule(expr: string): Schedule {
  const e = expr.trim();
  let m = /^(\d{1,2}) \* \* \* \*$/.exec(e);
  if (m && minuteOk(+m[1])) return { kind: "hourly" };
  m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(e);
  if (m && minuteOk(+m[1]) && hourOk(+m[2])) return { kind: "daily", time: `${pad(+m[2])}:${pad(+m[1])}` };
  m = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/.exec(e);
  if (m && minuteOk(+m[1]) && hourOk(+m[2])) return { kind: "weekly", weekday: +m[3], time: `${pad(+m[2])}:${pad(+m[1])}` };
  m = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/.exec(e);
  if (m && minuteOk(+m[1]) && hourOk(+m[2])) return { kind: "weekdays", time: `${pad(+m[2])}:${pad(+m[1])}` };
  return { kind: "custom" };
}

/** The cron expression of a preset. */
export function scheduleCron(s: Exclude<Schedule, { kind: "custom" }>): string {
  if (s.kind === "hourly") return "0 * * * *";
  const [h, min] = s.time.split(":").map(Number);
  if (s.kind === "daily") return `${min} ${h} * * *`;
  if (s.kind === "weekdays") return `${min} ${h} * * 1-5`;
  return `${min} ${h} * * ${s.weekday}`;
}

/** A new schedule trigger's expression (Conductor starts presets at 9:00, weekly on Monday). */
export function presetCron(kind: SchedulePreset): string {
  if (kind === "hourly") return "0 * * * *";
  if (kind === "daily") return "0 9 * * *";
  if (kind === "weekdays") return "0 9 * * 1-5";
  if (kind === "weekly") return "0 9 * * 1";
  return "0 9 * * *";
}

/** "9:00 AM" for "09:00", Conductor's `sCt`. */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, h, m));
}

/** "Every day at 9:00 AM" (Conductor's `M8a`), else the expression. */
export function describeCron(expr: string): string {
  const s = parseSchedule(expr);
  if (s.kind === "hourly") return "Every hour";
  if (s.kind === "daily") return `Every day at ${timeLabel(s.time)}`;
  if (s.kind === "weekdays") return `Every weekday at ${timeLabel(s.time)}`;
  if (s.kind === "weekly") return `Every ${WEEKDAYS[s.weekday]} at ${timeLabel(s.time)}`;
  return expr.trim();
}

/** The half-hour times the time selects list (Conductor's select steps by 30 minutes). */
export const TIMES: string[] = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);

const CRON_FIELD = /^(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?(,(\*|\d{1,2}(-\d{1,2})?)(\/\d{1,2})?)*$/;
const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/** A five-field cron expression with numbers in range ("Enter a valid cron expression."). */
export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f, i) => {
    if (!CRON_FIELD.test(f)) return false;
    const nums = f.match(/\d+/g)?.map(Number) ?? [];
    const steps = [...f.matchAll(/\/(\d+)/g)].map((m) => +m[1]);
    const values = nums.filter((n) => !steps.includes(n));
    return values.every((n) => n >= RANGES[i][0] && n <= RANGES[i][1]) && steps.every((n) => n > 0);
  });
}

/** Conductor's error under a schedule expression. */
export function cronError(expr: string): string | undefined {
  if (!expr.trim()) return "Enter a cron expression.";
  return isValidCron(expr) ? undefined : "Enter a valid cron expression.";
}

/** The trigger's one-line summary (Conductor's `s7a`). */
export function triggerSummary(t: Trigger): string {
  if (t.type === "cron") return `Scheduled · ${t.cronExpression}`;
  if (t.type === "github") return `GitHub · ${GITHUB_EVENT_LABEL[t.githubEvent]}`;
  if (t.type === "webhook") return "Webhook";
  return t.description;
}

/** The webhook dialog's command (Conductor's `mka`, plus Reason's bearer key). */
export function webhookCommand(url: string, key?: string): string {
  return [
    "curl --request POST \\",
    `  --header 'Authorization: Bearer ${key ?? "$REASON_LOOP_KEY"}' \\`,
    "  --header 'Content-Type: application/json' \\",
    "  --data '{}' \\",
    `  '${url}'`,
  ].join("\n");
}

// ---------- the table (Conductor's `K8a`, `H8a`, `h8a`, `p8a`, `g8a`)

/** date-fns `formatDistance(at, now, { addSuffix: true })`, which Conductor's columns use (`Oai`). */
export function formatDistance(at: number, now: number): string {
  const future = at > now;
  const seconds = Math.abs(now - at) / 1000;
  const minutes = Math.round(seconds / 60);
  let words: string;
  if (minutes < 1) words = "less than a minute";
  else if (minutes < 2) words = "1 minute";
  else if (minutes < 45) words = `${minutes} minutes`;
  else if (minutes < 90) words = "about 1 hour";
  else if (minutes < 1440) words = `about ${Math.round(minutes / 60)} hours`;
  else if (minutes < 2520) words = "1 day";
  else if (minutes < 43200) words = `${Math.round(minutes / 1440)} days`;
  else if (minutes < 86400) words = `about ${Math.round(minutes / 43200)} month${Math.round(minutes / 43200) === 1 ? "" : "s"}`;
  else if (minutes < 525600) words = `${Math.round(minutes / 43200)} months`;
  else words = `about ${Math.round(minutes / 525600)} year${Math.round(minutes / 525600) === 1 ? "" : "s"}`;
  return future ? `in ${words}` : `${words} ago`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The Last run column (`p8a`). */
export function lastRunLabel(r: Routine, now: number): string {
  if (!r.lastRun) return "Never";
  const at = Date.parse(r.lastRun.at);
  return now - at < 60_000 ? "Just now" : formatDistance(at, now);
}

/** The Next run column (`h8a`). */
export function nextRunLabel(r: Routine, now: number): string {
  if (!r.enabled) return "Disabled";
  if (r.nextRunAt && r.triggers.some((t) => t.type === "cron")) {
    const at = Date.parse(r.nextRunAt);
    return at <= now ? "Now" : capital(formatDistance(at, now));
  }
  if (r.triggers.some((t) => t.type === "webhook" || t.type === "github")) return "Event";
  if (r.triggers.some((t) => t.type === "cron")) return "Scheduled";
  return "None";
}

export type SortKey = "name" | "runCount" | "lastRun" | "nextRun" | "owner";
export interface Sort {
  key: SortKey;
  direction: "asc" | "desc";
}
/** Conductor's default sort (`a8a`) and each column's first direction (`l8a`). */
export const DEFAULT_SORT: Sort = { key: "lastRun", direction: "desc" };
const FIRST_DIRECTION: Record<SortKey, Sort["direction"]> = { name: "asc", owner: "asc", runCount: "desc", lastRun: "desc", nextRun: "asc" };
export function toggleSort(s: Sort, key: SortKey): Sort {
  return s.key !== key ? { key, direction: FIRST_DIRECTION[key] } : { key, direction: s.direction === "asc" ? "desc" : "asc" };
}

function sortValue(r: Routine, key: SortKey, owners: Map<string, string>): string | number | undefined {
  switch (key) {
    case "name":
      return r.name.toLocaleLowerCase();
    case "owner":
      return owners.get(r.ownerUserId)?.toLocaleLowerCase();
    case "runCount":
      return r.runCount;
    case "lastRun":
      return r.lastRun ? Date.parse(r.lastRun.at) : undefined;
    case "nextRun":
      return r.enabled && r.nextRunAt ? Date.parse(r.nextRunAt) : undefined;
  }
}

/** Sorted rows; rows without a value go last either way (`m8a`). */
export function sortRoutines(rows: Routine[], s: Sort, owners: Map<string, string>): Routine[] {
  const dir = s.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, s.key, owners);
    const y = sortValue(b, s.key, owners);
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
  });
}

export type Scope = "mine" | "team";
export const SCOPE_LABEL: Record<Scope, string> = { mine: "Me", team: "Team" };
/** "Me" shows the routines the signed-in person created (`u8a`). */
export function inScope(rows: Routine[], scope: Scope, userId: string | undefined): Routine[] {
  return scope === "team" ? rows : rows.filter((r) => r.ownerUserId === userId);
}

// ---------- suggestions (Conductor's `PHi`)

export interface Suggestion {
  id: "weekly-report" | "system-health-check" | "daily-herald";
  name: string;
  summary: string;
  cronExpression: string;
  prompt: string;
}

/** Conductor's three suggested routines: its names, summaries and schedules; the prompts are ours, for Reason. */
export const SUGGESTIONS: Suggestion[] = [
  {
    id: "weekly-report",
    name: "Weekly report",
    summary: "Recap what I got done this week across PRs and OpenConductor chats.",
    cronExpression: "0 17 * * 5",
    prompt:
      "Write my weekly report for the last seven days. Read the pull requests I opened, reviewed and merged in this repository, and the Reason Sessions I worked in. Group the work by theme, link each pull request, call out what is still open or blocked, and end with what I plan to pick up next week.",
  },
  {
    id: "system-health-check",
    name: "System health check",
    summary: "Review system health and find the top three easy wins.",
    cronExpression: "0 9 * * *",
    prompt:
      "Review the health of this repository: failing or flaky CI runs on the default branch, open dependency alerts, slow or skipped tests, and recent error reports you can reach. Pick the three easiest wins with the most impact, explain each in two sentences with links, and open a pull request for any that takes under an hour.",
  },
  {
    id: "daily-herald",
    name: "Create a daily company herald",
    summary: "Write an internal daily herald of what the team shipped and discussed.",
    cronExpression: "0 9 * * *",
    prompt:
      "Write today's internal herald covering the last 24 hours: pull requests merged in this repository, notable reviews and discussions, incidents or rollbacks, and work still in flight. Lead with the headline, group the rest by theme, quote sparingly with links, and keep a quiet day short.",
  },
];

export function suggestion(id: string): Suggestion | undefined {
  return SUGGESTIONS.find((s) => s.id === id);
}
