// parity:routines.editor
// Conductor's routine editor (`GHi`, renderApp-D_fmY7hW.js @11,507,472; create `FGt`
// @11,515,838, fork `U7a`, suggestion `z7a`): two resizable panels, the routine on the
// left (65%) and Runs on the right (35%). The left has a breadcrumb "Routines ›
// <name>" with Save, then the name, Active switch, repository select and author,
// Triggers with "Add trigger" (Scheduled presets, GitHub PR events, Webhook), and the
// Prompt with the model chip. Here it edits a Reason Loop; Runs shows the Loop's
// latest run (Reason gives no run history over the API).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronIcon, ClockIcon, CopyIcon, MoreIcon, PlayIcon, PlusIcon, PullRequestIcon, TrashIcon, WebhookIcon, CloseIcon, LinkIcon, PowerIcon } from "../../components/Icons";
import { DropdownMenu, MenuItem, SubMenu } from "../../components/menu/ContextMenu";
import { Modal } from "../../components/Dialogs";
import { copyText } from "../openIn/apps";
import { loadCachedModels, reasonModelName } from "../chat/reasonModels";
import type { Repo, RoutinesPage as Page } from "../../state/types";
import {
  createRoutine,
  deleteRoutine,
  errorText,
  getRoutine,
  loadRoutines,
  needsSignIn,
  routineLink,
  runRoutine,
  saveRoutine,
  sessionUrl,
  setRoutineEnabled,
  type IssuedWebhook,
} from "./api";
import {
  EMPTY_DRAFT,
  FILTER_FIELDS,
  FILTER_LABEL,
  GITHUB_EVENTS,
  GITHUB_EVENT_LABEL,
  GITHUB_EVENT_SHORT,
  SCHEDULE_PRESETS,
  SCHEDULE_PRESET_LABEL,
  TIMES,
  WEEKDAYS,
  cronError,
  draftOf,
  draftProblems,
  formatDistance,
  parseSchedule,
  presetCron,
  scheduleCron,
  suggestion,
  timeLabel,
  updateBodies,
  webhookCommand,
  type Filter,
  type GithubEvent,
  type Routine,
  type RoutineDraft,
  type SchedulePreset,
  type Trigger,
} from "./model";
import type { Notify } from "./RoutinesPage";
import "./routines.css";

let nextTriggerId = 0;
const newId = () => `new-${++nextTriggerId}`;

/** `owner/name` of a GitHub remote, else undefined (Conductor's `jYe`). */
export function githubRepo(remote: string | undefined): string | undefined {
  return remote?.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)?.slice(1, 3).join("/");
}

function ScheduleRow({ trigger, disabled, timezone, nextRunAt, onChange }: { trigger: Extract<Trigger, { type: "cron" }>; disabled: boolean; timezone: string; nextRunAt?: string; onChange: (expr: string) => void }) {
  const schedule = parseSchedule(trigger.cronExpression);
  const [custom, setCustom] = useState(schedule.kind === "custom");
  const error = custom ? cronError(trigger.cronExpression) : undefined;
  const time = schedule.kind === "daily" || schedule.kind === "weekdays" || schedule.kind === "weekly" ? schedule.time : "09:00";
  const tz = <span className="rt-word">{timezone}</span>;
  const timeSelect = (onTime: (t: string) => void) => (
    <select aria-label={`Time (${timezone})`} value={time} disabled={disabled} onChange={(e) => onTime(e.target.value)}>
      {(TIMES.includes(time) ? TIMES : [time, ...TIMES]).map((t) => (
        <option key={t} value={t}>
          {timeLabel(t)}
        </option>
      ))}
    </select>
  );
  let fields: ReactNode;
  if (custom)
    fields = (
      <input
        type="text"
        className="rt-cron"
        aria-label="Schedule expression"
        aria-invalid={error !== undefined}
        placeholder="0 9 * * *"
        value={trigger.cronExpression}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  else if (schedule.kind === "hourly") fields = <span>Every hour</span>;
  else if (schedule.kind === "daily")
    fields = (
      <>
        <span>Every day</span>
        <span className="rt-word">at</span>
        {timeSelect((t) => onChange(scheduleCron({ kind: "daily", time: t })))}
        {tz}
      </>
    );
  else if (schedule.kind === "weekdays")
    fields = (
      <>
        <span>Every weekday</span>
        <span className="rt-word">at</span>
        {timeSelect((t) => onChange(scheduleCron({ kind: "weekdays", time: t })))}
        {tz}
      </>
    );
  else if (schedule.kind === "weekly")
    fields = (
      <>
        <span>Every week</span>
        <span className="rt-word">on</span>
        <select aria-label="Weekday" value={schedule.weekday} disabled={disabled} onChange={(e) => onChange(scheduleCron({ kind: "weekly", weekday: Number(e.target.value), time }))}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <span className="rt-word">at</span>
        {timeSelect((t) => onChange(scheduleCron({ kind: "weekly", weekday: schedule.weekday, time: t })))}
        {tz}
      </>
    );
  return (
    <>
      <span className="rt-trigger-icon">
        <ClockIcon size={16} strokeWidth={1.5} />
      </span>
      {fields}
      {!custom && (
        <button type="button" className="rt-trigger-note" disabled={disabled} onClick={() => setCustom(true)}>
          Edit cron
        </button>
      )}
      {nextRunAt && !error && <span className="rt-next" title={`Next run ${new Date(nextRunAt).toLocaleString()}`}>Next run {formatDistance(Date.parse(nextRunAt), Date.now())}</span>}
      {error && (
        <p role="alert" className="rt-trigger-error" style={{ flexBasis: "100%" }}>
          {error}
        </p>
      )}
    </>
  );
}

function GithubRow({ trigger, disabled, repository, onChange }: { trigger: Extract<Trigger, { type: "github" }>; disabled: boolean; repository?: string; onChange: (t: Extract<Trigger, { type: "github" }>) => void }) {
  const setFilter = (i: number, f: Filter | null) => onChange({ ...trigger, filters: f ? trigger.filters.map((x, j) => (j === i ? f : x)) : trigger.filters.filter((_, j) => j !== i) });
  return (
    <>
      <span className="rt-trigger-icon">
        <PullRequestIcon size={16} strokeWidth={1.5} />
      </span>
      <span>Pull request</span>
      <select aria-label="Pull request event" value={trigger.githubEvent} disabled={disabled} onChange={(e) => onChange({ ...trigger, githubEvent: e.target.value as GithubEvent })}>
        {GITHUB_EVENTS.map((ev) => (
          <option key={ev} value={ev}>
            {GITHUB_EVENT_SHORT[ev]}
          </option>
        ))}
      </select>
      {!repository && <span className="rt-trigger-note">Choose a GitHub repository</span>}
      {trigger.filters.map((f, i) => (
        <span className="rt-filter" key={i}>
          <select aria-label="Filter field" value={f.field} disabled={disabled} onChange={(e) => setFilter(i, { ...f, field: e.target.value as Filter["field"] })}>
            {FILTER_FIELDS.map((k) => (
              <option key={k} value={k}>
                {FILTER_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="rt-word">is</span>
          <input type="text" aria-label={f.field === "author" ? "GitHub username" : "Label"} placeholder={f.field === "author" ? "Type a GitHub username" : "Label"} value={f.value} disabled={disabled} onChange={(e) => setFilter(i, { ...f, value: e.target.value })} />
          <button type="button" className="rt-ghost-icon" aria-label="Remove filter" disabled={disabled} onClick={() => setFilter(i, null)}>
            <CloseIcon size={12} />
          </button>
        </span>
      ))}
      <button type="button" className="rt-trigger-note" disabled={disabled} onClick={() => onChange({ ...trigger, filters: [...trigger.filters, { field: "author", value: "" }] })}>
        Filter
      </button>
    </>
  );
}

function WebhookRow({ trigger, issued, onShow }: { trigger: Extract<Trigger, { type: "webhook" }>; issued?: IssuedWebhook; onShow: () => void }) {
  const url = issued?.url ?? trigger.webhookUrl;
  return (
    <>
      <span className="rt-trigger-icon">
        <WebhookIcon size={16} strokeWidth={1.5} />
      </span>
      <span>Webhook</span>
      <span className="rt-next">{url ?? "Activates when you save"}</span>
      <button type="button" className="rt-ghost-icon" aria-label="Webhook instructions" disabled={!url} onClick={onShow}>
        <CopyIcon size={14} />
      </button>
    </>
  );
}

function WebhookDialog({ webhook, onClose, notify }: { webhook: IssuedWebhook; onClose: () => void; notify: Notify }) {
  const command = webhookCommand(webhook.url, webhook.key);
  return (
    <Modal title="Trigger with a webhook" onClose={onClose}>
      <div className="rt-dialog-body">
        <p>Post JSON to this URL to run the routine.</p>
        {webhook.key ? <p>Reason shows this key only once. Keep it in the sender's secret store.</p> : <p>Use the key Reason gave when the webhook was added; Reason does not show it again.</p>}
        <pre className="rt-pre">{command}</pre>
      </div>
      <div className="rt-dialog-foot">
        <button
          type="button"
          className="rt-outline"
          onClick={() =>
            void copyText(command).then(
              () => notify("info", "Copied command"),
              () => notify("error", "Couldn't copy command"),
            )
          }
        >
          <CopyIcon size={14} />
          Copy
        </button>
      </div>
    </Modal>
  );
}

interface Props {
  page: Extract<Page, { view: "new" | "edit" | "fork" }>;
  repos: Repo[];
  onNavigate: (page?: Page) => void;
  onOpenReasonSettings: () => void;
  notify: Notify;
}

type Loaded = { state: "loading" } | { state: "error"; error: unknown } | { state: "ready"; saved?: Routine; draft: RoutineDraft; reasonId?: string; userId?: string; author?: string };

/** Conductor's `GHi` on a Reason Loop: create (`FGt`), edit, fork (`U7a`) and suggestion (`z7a`). */
export function RoutineEditor({ page, repos, onNavigate, onOpenReasonSettings, notify }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedWebhook | undefined>();
  const [showWebhook, setShowWebhook] = useState(false);
  const [addMenu, setAddMenu] = useState<DOMRect | null>(null);
  const [moreMenu, setMoreMenu] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const models = useMemo(() => loadCachedModels(), []);
  const key = JSON.stringify(page);

  useEffect(() => {
    let alive = true;
    setIssued(undefined);
    if (page.view === "new") {
      // A new routine opens at once, like Conductor's `FGt`; the account fills in the author when Reason answers.
      const s = page.suggestion ? suggestion(page.suggestion) : undefined;
      const draft: RoutineDraft = s ? { ...EMPTY_DRAFT, name: s.name, prompt: s.prompt, triggers: [{ id: newId(), type: "cron", cronExpression: s.cronExpression }] } : { ...EMPTY_DRAFT };
      setLoaded({ state: "ready", draft });
      loadRoutines().then(
        (list) =>
          alive &&
          setLoaded((prev) =>
            prev.state === "ready" ? { ...prev, reasonId: list.mainReason?.id, userId: list.userId, author: list.userId ? list.owners.get(list.userId) : undefined } : prev,
          ),
        () => {},
      );
      return () => {
        alive = false;
      };
    }
    setLoaded({ state: "loading" });
    (async () => {
      const list = await loadRoutines();
      const author = list.userId ? list.owners.get(list.userId) : undefined;
      const routine = await getRoutine(page.reasonId, page.id);
      if (page.view === "fork")
        return {
          state: "ready" as const,
          draft: { ...draftOf(routine), name: `${routine.name} (copy)`, triggers: routine.triggers.filter((t) => t.type !== "other").map((t) => ({ ...t, id: newId(), ...(t.type === "webhook" ? { webhookUrl: undefined } : {}) })) },
          reasonId: list.mainReason?.id,
          userId: list.userId,
          author,
        };
      return { state: "ready" as const, saved: routine, draft: draftOf(routine), reasonId: routine.reasonId, userId: list.userId, author: list.owners.get(routine.ownerUserId) };
    })().then(
      (l) => alive && setLoaded(l),
      (error) => alive && setLoaded({ state: "error", error }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const back = () => onNavigate(undefined);
  if (loaded.state === "loading")
    return (
      <div className="rt-editor">
        <div role="status" aria-label="Loading routine" className="rt-status" style={{ flex: 1, alignItems: "center" }}>
          <span className="rt-loader" />
        </div>
      </div>
    );
  if (loaded.state === "error")
    return (
      <div className="rt-editor" style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--muted)", fontSize: 14 }}>
        <span>{needsSignIn(loaded.error) ? "Sign in to Reason to use routines" : "Couldn't load routine"}</span>
        <span>{errorText(loaded.error)}</span>
        {needsSignIn(loaded.error) ? (
          <button type="button" className="rt-outline" onClick={onOpenReasonSettings}>
            Open Reason settings
          </button>
        ) : (
          <button type="button" className="rt-outline" onClick={back}>
            Back to routines
          </button>
        )}
      </div>
    );

  const { saved, draft, reasonId, author } = loaded;
  const canWrite = saved ? saved.canEdit : true;
  const disabled = !canWrite || saving;
  const set = (d: Partial<RoutineDraft>) => setLoaded({ ...loaded, draft: { ...draft, ...d } });
  const setTrigger = (id: string, t: Trigger | null) => set({ triggers: t ? draft.triggers.map((x) => (x.id === id ? t : x)) : draft.triggers.filter((x) => x.id !== id) });
  const dirty = saved ? updateBodies(saved, draft).length > 0 : true;
  const timezone = saved?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const repoOptions = [...new Set(repos.map((r) => githubRepo(r.remote)).filter((r): r is string => !!r))];
  if (draft.repository && !repoOptions.includes(draft.repository)) repoOptions.unshift(draft.repository);
  const hasSchedule = draft.triggers.some((t) => t.type === "cron");
  const hasWebhook = draft.triggers.some((t) => t.type === "webhook");

  const save = async () => {
    const problems = draftProblems(draft);
    if (problems.length) {
      notify("error", `Routine isn't ready: ${problems.join("; ")}.`);
      return;
    }
    setSaving(true);
    try {
      if (saved) {
        const out = await saveRoutine(saved, draft);
        setLoaded({ ...loaded, saved: out.routine, draft: { ...draftOf(out.routine) } });
        if (out.webhook) {
          setIssued(out.webhook);
          setShowWebhook(true);
        }
      } else {
        const target = reasonId ?? (await loadRoutines()).mainReason?.id;
        if (!target) throw { code: "no_reason", message: "Reason has no main Reason for this account to file the routine under." };
        const out = await createRoutine(target, draft);
        if (out.webhook) {
          setIssued(out.webhook);
          setShowWebhook(true);
        }
        onNavigate({ view: "edit", reasonId: out.routine.reasonId, id: out.routine.id });
      }
    } catch (e) {
      notify("error", saved ? `Couldn't save routine: ${errorText(e)}` : `Couldn't create routine: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const run = async () => {
    if (!saved) return;
    setBusy(true);
    try {
      const r = await runRoutine(saved);
      setLoaded({ ...loaded, saved: r });
      notify("info", "Routine started", r.lastRun?.sessionId ? { action: { label: "Open Session", onClick: () => void window.open(sessionUrl(r.lastRun!.sessionId), "_blank") } } : undefined);
    } catch (e) {
      notify("error", `Couldn't run routine: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rt-editor">
      <div className="rt-config" id="automation-config">
        <div className="rt-bar" data-tauri-drag-region>
          <nav className="rt-crumbs" aria-label="Breadcrumb">
            <button type="button" onClick={back}>
              Routines
            </button>
            <ChevronIcon size={12} />
            <span>{draft.name.trim() || "Untitled routine"}</span>
          </nav>
          <div className="rt-bar-right">
            {saved && (
              <>
                <button type="button" className="rt-outline" disabled={!saved.canEdit || !saved.enabled || !hasSchedule || busy || dirty} title="Run now" onClick={() => void run()}>
                  <PlayIcon size={14} />
                  Run now
                </button>
                <button type="button" className="rt-ghost-icon" aria-label="More" onClick={(e) => setMoreMenu(e.currentTarget.getBoundingClientRect())}>
                  <MoreIcon size={16} />
                </button>
              </>
            )}
            <button type="button" className="rt-primary" disabled={disabled || !dirty} onClick={() => void save()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="rt-config-scroll">
          <div className="rt-form">
            <input className="rt-name-input" aria-label="Title" placeholder="Untitled routine" value={draft.name} disabled={disabled} onChange={(e) => set({ name: e.target.value })} />
            <div className="rt-meta">
              <label className="rt-switch-label">
                <input type="checkbox" role="switch" className="rt-switch" checked={draft.enabled} disabled={disabled} onChange={(e) => set({ enabled: e.target.checked })} />
                <span>{draft.enabled ? "Active" : "Disabled"}</span>
              </label>
              <span className="rt-meta-sep" />
              <span className="rt-select">
                <select aria-label="Repository" value={draft.repository ?? ""} disabled={disabled} onChange={(e) => set({ repository: e.target.value || undefined })}>
                  <option value="">Select repository</option>
                  {repoOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon size={12} />
              </span>
              <span className="rt-meta-sep" />
              <span className="rt-author">
                <span className="rt-avatar">{(author ?? "?").slice(0, 1).toUpperCase()}</span>
                <span>By {author ?? "you"}</span>
              </span>
            </div>

            <section className="rt-section">
              <h3>Triggers</h3>
              {draft.triggers.length > 0 && (
                <div className="rt-triggers">
                  {draft.triggers.map((t) => (
                    <div className="rt-trigger" key={t.id}>
                      {t.type === "cron" && <ScheduleRow trigger={t} disabled={disabled} timezone={timezone} nextRunAt={saved?.nextRunAt} onChange={(cronExpression) => setTrigger(t.id, { ...t, cronExpression })} />}
                      {t.type === "github" && <GithubRow trigger={t} disabled={disabled} repository={draft.repository} onChange={(n) => setTrigger(t.id, n)} />}
                      {t.type === "webhook" && <WebhookRow trigger={t} issued={issued} onShow={() => setShowWebhook(true)} />}
                      {t.type === "other" && <span className="rt-trigger-note">{t.description} (set up in Reason; kept as it is)</span>}
                      {t.type !== "other" && (
                        <button type="button" className="rt-ghost-icon rt-remove" aria-label="Remove trigger" disabled={disabled} onClick={() => setTrigger(t.id, null)}>
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="rt-outline" disabled={disabled} title={canWrite ? undefined : "Only the owner or an org admin can change this routine"} onClick={(e) => setAddMenu(e.currentTarget.getBoundingClientRect())}>
                <PlusIcon size={14} />
                Add trigger
              </button>
              {addMenu && (
                <DropdownMenu anchor={addMenu} onClose={() => setAddMenu(null)} label="Add trigger">
                  <SubMenu icon={<ClockIcon size={16} />} label="Scheduled">
                    {SCHEDULE_PRESETS.map((k: SchedulePreset) => (
                      <MenuItem key={k} disabled={hasSchedule} onSelect={() => set({ triggers: [...draft.triggers, { id: newId(), type: "cron", cronExpression: presetCron(k) }] })}>
                        {SCHEDULE_PRESET_LABEL[k]}
                      </MenuItem>
                    ))}
                  </SubMenu>
                  <SubMenu icon={<PullRequestIcon size={16} />} label="GitHub">
                    {GITHUB_EVENTS.map((ev) => (
                      <MenuItem key={ev} onSelect={() => set({ triggers: [...draft.triggers, { id: newId(), type: "github", githubEvent: ev, filters: [] }] })}>
                        {GITHUB_EVENT_LABEL[ev]}
                      </MenuItem>
                    ))}
                  </SubMenu>
                  <MenuItem icon={<WebhookIcon size={16} />} disabled={hasWebhook} onSelect={() => set({ triggers: [...draft.triggers, { id: newId(), type: "webhook" }] })}>
                    Webhook
                  </MenuItem>
                </DropdownMenu>
              )}
            </section>

            <section className="rt-section">
              <h3>Prompt</h3>
              <div className="rt-prompt">
                <textarea aria-label="Prompt" placeholder="What should this routine do?" value={draft.prompt} disabled={disabled} onChange={(e) => set({ prompt: e.target.value })} />
                <div className="rt-prompt-foot">
                  <span className="rt-model" title="Change agent">
                    <select aria-label="Model" value={draft.model ?? ""} disabled={disabled} onChange={(e) => set({ model: e.target.value || undefined })}>
                      <option value="">Reason · Auto</option>
                      {models
                        .filter((m) => m.value !== "default")
                        .map((m) => (
                          <option key={m.value} value={m.value}>
                            Reason · {m.name}
                          </option>
                        ))}
                      {draft.model && !models.some((m) => m.value === draft.model) && <option value={draft.model}>Reason · {reasonModelName(draft.model, models)}</option>}
                    </select>
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="rt-runs" id="automation-runs">
        <div className="rt-bar">
          <span className="rt-runs-title">Runs</span>
        </div>
        <div className="rt-runs-body">
          {saved?.enabled && saved.nextRunAt && <div className="rt-runs-next">Next run {formatDistance(Date.parse(saved.nextRunAt), Date.now())}</div>}
          {saved?.lastRun ? (
            <div className="rt-run">
              <div className="rt-run-top">
                <span>{saved.lastRun.status ? saved.lastRun.status.charAt(0).toUpperCase() + saved.lastRun.status.slice(1) : "Run"}</span>
                <span>{formatDistance(Date.parse(saved.lastRun.at), Date.now())}</span>
              </div>
              {saved.lastRun.sessionId && (
                <a href={sessionUrl(saved.lastRun.sessionId)} target="_blank" rel="noreferrer">
                  Open Reason Session
                </a>
              )}
            </div>
          ) : (
            <div className="rt-runs-empty">No runs yet</div>
          )}
          {saved && saved.runCount > 1 && <p className="rt-runs-note">{saved.runCount} runs in all. Reason keeps each run as a Session of its Reason; this list shows the latest.</p>}
          {saved?.pausedReason && <p className="rt-runs-note">Paused by Reason: {saved.pausedReason.replace(/_/g, " ")}.</p>}
        </div>
      </div>

      {moreMenu && saved && (
        <DropdownMenu anchor={moreMenu} onClose={() => setMoreMenu(null)} label="More">
          {saved.canStop && (
            <MenuItem
              icon={<PowerIcon size={16} />}
              onSelect={() =>
                void setRoutineEnabled(saved, !saved.enabled).then(
                  (r) => setLoaded({ ...loaded, saved: r, draft: { ...draft, enabled: r.enabled } }),
                  (e) => notify("error", `Couldn't ${saved.enabled ? "disable" : "enable"} routine: ${errorText(e)}`),
                )
              }
            >
              {saved.enabled ? "Disable" : "Enable"}
            </MenuItem>
          )}
          <MenuItem icon={<CopyIcon size={16} />} onSelect={() => onNavigate({ view: "fork", reasonId: saved.reasonId, id: saved.id })}>
            Duplicate
          </MenuItem>
          <MenuItem
            icon={<LinkIcon size={16} />}
            onSelect={() =>
              void copyText(routineLink(saved)).then(
                () => notify("info", "Copied link"),
                () => notify("error", "Failed to copy link"),
              )
            }
          >
            Copy link
          </MenuItem>
          {saved.canStop && (
            <MenuItem icon={<TrashIcon size={16} />} destructive onSelect={() => setConfirmDelete(true)}>
              Delete
            </MenuItem>
          )}
        </DropdownMenu>
      )}
      {confirmDelete && saved && (
        <Modal title={`Delete ${saved.name}?`} onClose={() => setConfirmDelete(false)} motion="alert">
          <div className="rt-dialog-body">
            <p>This permanently deletes the routine and its run history.</p>
          </div>
          <div className="rt-dialog-foot">
            <button type="button" className="rt-outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="rt-danger"
              aria-label="Delete routine"
              onClick={() => {
                setConfirmDelete(false);
                void deleteRoutine(saved).then(
                  () => {
                    notify("info", "Routine deleted");
                    back();
                  },
                  (e) => notify("error", `Couldn't delete routine: ${errorText(e)}`),
                );
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
      {showWebhook && (issued ?? draft.triggers.find((t): t is Extract<Trigger, { type: "webhook" }> => t.type === "webhook" && !!t.webhookUrl)) && (
        <WebhookDialog
          webhook={issued ?? { url: (draft.triggers.find((t) => t.type === "webhook") as Extract<Trigger, { type: "webhook" }>).webhookUrl! }}
          onClose={() => setShowWebhook(false)}
          notify={notify}
        />
      )}
    </div>
  );
}
