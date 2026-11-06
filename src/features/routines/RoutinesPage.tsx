// parity:routines.list
// Conductor's /routines (`eka` → `tka` → `K8a`, renderApp-D_fmY7hW.js @11,415,000-11,423,000):
// header "Routines" / "Run agents on a schedule" with New routine; then a loading
// spinner, the "Add your first routine" empty state, or a Me/Team toggle over a
// sortable table (Name, Run, Runs, Last run, Next run, Author, Created, actions);
// "Suggested routines" below. Routines here are Reason Loops (api.ts); the Created
// column is left out because a Loop has no creation time.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyText as writeText } from "../openIn/apps";
import {
  CalendarCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CopyIcon,
  HeartPulseIcon,
  LinkIcon,
  MoreIcon,
  NewspaperIcon,
  PlayIcon,
  PowerIcon,
  SidebarIcon,
  TrashIcon,
} from "../../components/Icons";
import { DropdownMenu, MenuItem } from "../../components/menu/ContextMenu";
import { Modal } from "../../components/Dialogs";
import type { RoutinesPage as Page } from "../../state/types";
import { deleteRoutine, errorText, loadRoutines, needsSignIn, routineLink, runRoutine, setRoutineEnabled, type RoutinesData } from "./api";
import {
  DEFAULT_SORT,
  SCOPE_LABEL,
  SUGGESTIONS,
  describeCron,
  inScope,
  lastRunLabel,
  nextRunLabel,
  sortRoutines,
  toggleSort,
  type Routine,
  type Scope,
  type Sort,
  type SortKey,
  type Suggestion,
} from "./model";
import "./routines.css";

export type Notify = (kind: "info" | "error", message: string, opts?: { action?: { label: string; onClick: () => void } }) => void;

const SUGGESTION_ICON: Record<Suggestion["id"], ReactNode> = {
  "weekly-report": <CalendarCheckIcon size={12} strokeWidth={1.5} />,
  "system-health-check": <HeartPulseIcon size={12} strokeWidth={1.5} />,
  "daily-herald": <NewspaperIcon size={12} strokeWidth={1.5} />,
};

/** Conductor's `j8a`: three cards that open the editor with a suggestion. */
function Suggestions({ onUse }: { onUse: (id: string) => void }) {
  return (
    <section className="rt-suggest">
      <h2>Suggested routines</h2>
      <div className="rt-suggest-grid">
        {SUGGESTIONS.map((s) => (
          <button key={s.id} type="button" className="rt-card" onClick={() => onUse(s.id)}>
            <span className="rt-card-icon">{SUGGESTION_ICON[s.id]}</span>
            <span className="rt-card-text">
              <span className="rt-card-name">{s.name}</span>
              <span className="rt-card-summary">{s.summary}</span>
              <span className="rt-card-when">
                <ClockIcon size={14} strokeWidth={1.5} />
                {describeCron(s.cronExpression)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SortHeader({ label, k, sort, onSort, width }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; width: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} style={{ width }}>
      <button type="button" className="rt-sort" data-active={active || undefined} onClick={() => onSort(k)}>
        {label}
        {active && (sort.direction === "asc" ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />)}
      </button>
    </th>
  );
}

interface RowProps {
  routine: Routine;
  owner?: string;
  isMine: boolean;
  busy: boolean;
  now: number;
  onOpen: () => void;
  onRun: () => void;
  onFork: () => void;
  onCopyLink: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

/** One table row (Conductor's `H8a`). */
function Row({ routine: r, owner, isMine, busy, now, onOpen, onRun, onFork, onCopyLink, onToggle, onDelete }: RowProps) {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [confirming, setConfirming] = useState(false);
  const canRun = r.canEdit && r.enabled && r.triggers.some((t) => t.type === "cron");
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <tr tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}>
      <td className="rt-name" title={r.name}>
        {r.name}
      </td>
      <td className="rt-narrow" onClick={stop} onKeyDown={stop}>
        {isMine && (
          <button
            type="button"
            className="rt-outline"
            aria-label={`Run ${r.name}`}
            title={r.canEdit ? "Run now" : "Only the owner or an org admin can change this routine"}
            disabled={!canRun || busy}
            onClick={onRun}
          >
            <PlayIcon size={14} />
            Run
          </button>
        )}
      </td>
      <td>{r.runCount}</td>
      <td>{lastRunLabel(r, now)}</td>
      <td className={r.enabled ? undefined : "rt-off"}>{nextRunLabel(r, now)}</td>
      <td>
        {owner !== undefined && (
          <span className="rt-author">
            <span className="rt-avatar" role="img" aria-label={`${owner} avatar`}>
              {owner.slice(0, 1).toUpperCase()}
            </span>
            <span>{owner}</span>
          </span>
        )}
      </td>
      <td className="rt-narrow" onClick={stop} onKeyDown={stop}>
        <button type="button" className="rt-ghost-icon" aria-label={`More actions for ${r.name}`} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
          <MoreIcon size={16} />
        </button>
        {menu && (
          <DropdownMenu anchor={menu} onClose={() => setMenu(null)} label={`More actions for ${r.name}`}>
            {r.canStop && (
              <MenuItem icon={<PowerIcon size={16} />} disabled={busy} onSelect={onToggle}>
                {r.enabled ? "Disable" : "Enable"}
              </MenuItem>
            )}
            <MenuItem icon={<CopyIcon size={16} />} onSelect={onFork}>
              Duplicate
            </MenuItem>
            <MenuItem icon={<LinkIcon size={16} />} onSelect={onCopyLink}>
              Copy link
            </MenuItem>
            {r.canStop && (
              <MenuItem icon={<TrashIcon size={16} />} destructive disabled={busy} onSelect={() => setConfirming(true)}>
                Delete
              </MenuItem>
            )}
          </DropdownMenu>
        )}
        {confirming && (
          <Modal title={`Delete ${r.name}?`} onClose={() => setConfirming(false)} motion="alert">
            <div className="rt-dialog-body">
              <p>This permanently deletes the routine and its run history.</p>
            </div>
            <div className="rt-dialog-foot">
              <button type="button" className="rt-outline" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rt-danger"
                aria-label="Delete routine"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </div>
          </Modal>
        )}
      </td>
    </tr>
  );
}

interface Props {
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  onNavigate: (page?: Page) => void;
  onOpenReasonSettings: () => void;
  notify: Notify;
}

type Load = { state: "loading" } | { state: "ready"; data: RoutinesData } | { state: "error"; error: unknown };

/** Conductor's `K8a` over Reason Loops. */
export function RoutinesPage({ sidebarVisible, onToggleSidebar, onNavigate, onOpenReasonSettings, notify }: Props) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [scope, setScope] = useState<Scope>("mine");
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(true);

  const refresh = useCallback(() => {
    loadRoutines().then(
      (data) => alive.current && setLoad({ state: "ready", data }),
      (error) => alive.current && setLoad((prev) => (prev.state === "ready" ? prev : { state: "error", error })),
    );
  }, []);
  useEffect(() => {
    alive.current = true;
    refresh();
    // Conductor refetches the list every minute (refetchIntervalMs 6e4) and ticks "now" with it.
    const t = window.setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 60_000);
    return () => {
      alive.current = false;
      window.clearInterval(t);
    };
  }, [refresh]);

  const data = load.state === "ready" ? load.data : undefined;
  const replace = (r: Routine) =>
    setLoad((prev) => (prev.state === "ready" ? { state: "ready", data: { ...prev.data, routines: prev.data.routines.map((x) => (x.id === r.id ? r : x)) } } : prev));
  const act = async (r: Routine, f: () => Promise<void>) => {
    setBusyId(r.id);
    try {
      await f();
    } finally {
      setBusyId(null);
    }
  };

  const rows = useMemo(() => (data ? sortRoutines(inScope(data.routines, scope, data.userId), sort, data.owners) : []), [data, scope, sort]);
  const newRoutine = () => onNavigate({ view: "new" });

  let body: ReactNode;
  if (load.state === "loading") body = <div role="status" aria-label="Loading routines" className="rt-status"><span className="rt-loader" /></div>;
  else if (load.state === "error")
    body = needsSignIn(load.error) ? (
      <div className="rt-notice">
        <strong>Sign in to Reason to use routines</strong>
        <span>Routines run as Reason Loops in your Reason workspace. {errorText(load.error)}</span>
        <button type="button" className="rt-outline" onClick={onOpenReasonSettings}>
          Open Reason settings
        </button>
      </div>
    ) : (
      <div className="rt-notice">
        <strong>Couldn't load routines</strong>
        <span>{errorText(load.error)}</span>
        <button type="button" className="rt-outline" onClick={refresh}>
          Try again
        </button>
      </div>
    );
  else if (load.data.routines.length === 0)
    body = (
      <div className="rt-empty">
        <h2>Add your first routine</h2>
        <button type="button" className="rt-primary" onClick={newRoutine}>
          New routine
        </button>
      </div>
    );
  else
    body = (
      <>
        <div className="rt-scope" role="group" aria-label="Show routines">
          {(["mine", "team"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="rt-none">You haven't created any routines yet.</p>
        ) : (
          <div className="rt-table-wrap" data-routines-scroll-area>
            <table className="rt-table">
              <thead>
                <tr>
                  <SortHeader label="Name" k="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} width="26%" />
                  <th scope="col" aria-label="Run" className="rt-narrow" style={{ width: "10%" }} />
                  <SortHeader label="Runs" k="runCount" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} width="8%" />
                  <SortHeader label="Last run" k="lastRun" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} width="16%" />
                  <SortHeader label="Next run" k="nextRun" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} width="16%" />
                  <SortHeader label="Author" k="owner" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} width="20%" />
                  <th scope="col" aria-label="Actions" className="rt-narrow" style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row
                    key={r.id}
                    routine={r}
                    owner={load.data.owners.get(r.ownerUserId)}
                    isMine={r.ownerUserId === load.data.userId}
                    busy={busyId === r.id}
                    now={now}
                    onOpen={() => onNavigate({ view: "edit", reasonId: r.reasonId, id: r.id })}
                    onFork={() => onNavigate({ view: "fork", reasonId: r.reasonId, id: r.id })}
                    onCopyLink={() =>
                      void writeText(routineLink(r)).then(
                        () => notify("info", "Copied link"),
                        () => notify("error", "Failed to copy link"),
                      )
                    }
                    onRun={() =>
                      void act(r, async () => {
                        try {
                          replace(await runRoutine(r));
                          notify("info", "Routine started");
                        } catch (e) {
                          notify("error", `Couldn't run routine: ${errorText(e)}`);
                        }
                      })
                    }
                    onToggle={() =>
                      void act(r, async () => {
                        try {
                          replace(await setRoutineEnabled(r, !r.enabled));
                        } catch (e) {
                          notify("error", `Couldn't ${r.enabled ? "disable" : "enable"} routine: ${errorText(e)}`);
                        }
                      })
                    }
                    onDelete={() =>
                      void act(r, async () => {
                        try {
                          await deleteRoutine(r);
                          setLoad((prev) => (prev.state === "ready" ? { state: "ready", data: { ...prev.data, routines: prev.data.routines.filter((x) => x.id !== r.id) } } : prev));
                          notify("info", "Routine deleted");
                        } catch (e) {
                          notify("error", `Couldn't delete routine: ${errorText(e)}`);
                        }
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );

  return (
    <div className="rt">
      <div className="rt-top" data-tauri-drag-region>
        {!sidebarVisible && (
          <button type="button" className="rt-ghost-icon rt-sidebar-toggle" aria-label="Toggle left sidebar" onClick={onToggleSidebar}>
            <SidebarIcon size={16} />
          </button>
        )}
        <div className="rt-head" data-tauri-drag-region>
          <div data-tauri-drag-region>
            <h1 className="rt-title">Routines</h1>
            <p className="rt-sub">Run agents on a schedule</p>
          </div>
          <button type="button" className="rt-primary" onClick={newRoutine}>
            New routine
          </button>
        </div>
      </div>
      <div className="rt-scroll">
        <div className="rt-body">
          {body}
          <Suggestions onUse={(id) => onNavigate({ view: "new", suggestion: id })} />
        </div>
      </div>
    </div>
  );
}
