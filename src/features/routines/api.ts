// Routines' calls: public Reason API operations through the desktop app's
// `reason_api_call` command (`reason call OPERATION`, src-tauri/src/reason_acp/api.rs).
// The CLI signs in and pins the Workspace; OpenConductor holds no Reason credential.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createBody, routineFromLoop, updateBodies, type Routine, type RoutineDraft } from "./model.ts";

export interface ApiError {
  code: string;
  message: string;
}

/** A failed call's words ("Couldn't run routine: <this>"). */
export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as ApiError).message === "string") return (e as ApiError).message;
  return String(e);
}

/** The call needs a signed-in `reason` (Settings › Agents › Reason). */
export function needsSignIn(e: unknown): boolean {
  const code = e && typeof e === "object" && "code" in e ? (e as ApiError).code : "";
  return code === "authentication_required" || code === "workspace_login_required" || code === "reason_unavailable";
}

type Json = Record<string, unknown>;

async function call<T = Json>(operation: string, input: Json = {}): Promise<T> {
  // No isTauri() gate: the side-by-side harness answers IPC without making the whole app a desktop one.
  if (!isTauri() && !("__TAURI_INTERNALS__" in window)) throw { code: "reason_unavailable", message: "Routines run in the OpenConductor desktop app." } satisfies ApiError;
  return invoke<T>("reason_api_call", { operation, input });
}

export interface ReasonRef {
  id: string;
  name: string;
  main: boolean;
  mine: boolean;
}

export interface RoutinesData {
  routines: Routine[];
  /** The signed-in person's Reason user id ("Me"). */
  userId?: string;
  /** user id → name or email, for the Author column (Conductor's `LHi`: name ?? email). */
  owners: Map<string, string>;
  /** Where new routines are filed: the person's main Reason. */
  mainReason?: ReasonRef;
}

const items = (v: unknown): Json[] => (Array.isArray((v as Json)?.items) ? ((v as Json).items as Json[]) : []);

/** Every Loop on the Reasons the person can see, who they are, and the members' names. */
export async function loadRoutines(): Promise<RoutinesData> {
  const [self, reasons, members] = await Promise.all([
    call("getSelf"),
    call("listReasons"),
    call("listMembers").catch(() => ({ items: [] })),
  ]);
  const refs: ReasonRef[] = items(reasons).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), main: r.main === true, mine: r.mine === true }));
  const lists = await Promise.all(refs.map((r) => call("listReasonLoops", { path: { reasonId: r.id } }).catch(() => ({ items: [] }))));
  const owners = new Map<string, string>();
  for (const m of items(members)) if (typeof m.user_id === "string") owners.set(m.user_id, String(m.email ?? m.user_id));
  const userId = typeof self.user_id === "string" ? self.user_id : undefined;
  // Members carry no names (Member: user_id, email, role); the signed-in person's own comes from getSelf.
  if (userId && typeof (self.user_name ?? self.email) === "string") owners.set(userId, String(self.user_name ?? self.email));
  return {
    routines: lists.flatMap((l, i) => items(l).map((loop) => routineFromLoop({ reason_id: refs[i].id, ...loop }))),
    userId,
    owners,
    mainReason: refs.find((r) => r.main && r.mine) ?? refs.find((r) => r.mine),
  };
}

export async function getRoutine(reasonId: string, id: string): Promise<Routine> {
  return routineFromLoop({ reason_id: reasonId, ...(await call("getReasonLoop", { path: { reasonId, loopId: id } })) });
}

/** A webhook Reason gave out: its URL, and its key, which Reason returns only this once. */
export interface IssuedWebhook {
  url: string;
  key?: string;
}

function issued(out: Json): IssuedWebhook | undefined {
  return typeof out.url === "string" ? { url: out.url, key: typeof out.key === "string" ? out.key : undefined } : undefined;
}

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function createRoutine(reasonId: string, d: RoutineDraft): Promise<{ routine: Routine; webhook?: IssuedWebhook }> {
  const out = await call("createReasonLoop", { path: { reasonId }, body: createBody(d, localTimezone()) });
  return { routine: routineFromLoop({ reason_id: reasonId, ...(out.loop as Json) }), webhook: issued(out) };
}

export async function saveRoutine(saved: Routine, d: RoutineDraft): Promise<{ routine: Routine; webhook?: IssuedWebhook }> {
  let routine = saved;
  let webhook: IssuedWebhook | undefined;
  for (const body of updateBodies(saved, d)) {
    const out = await call("updateReasonLoop", { path: { reasonId: saved.reasonId, loopId: saved.id }, body });
    routine = routineFromLoop({ reason_id: saved.reasonId, ...(out.loop as Json) });
    webhook = issued(out) ?? webhook;
  }
  return { routine, webhook };
}

export async function setRoutineEnabled(r: Routine, enabled: boolean): Promise<Routine> {
  const out = await call("updateReasonLoop", { path: { reasonId: r.reasonId, loopId: r.id }, body: { enabled } });
  return routineFromLoop({ reason_id: r.reasonId, ...(out.loop as Json) });
}

export async function runRoutine(r: Routine): Promise<Routine> {
  const out = await call("runReasonLoop", { path: { reasonId: r.reasonId, loopId: r.id } });
  return out.loop ? routineFromLoop({ reason_id: r.reasonId, ...(out.loop as Json) }) : r;
}

export async function deleteRoutine(r: Routine): Promise<void> {
  await call("deleteReasonLoop", { path: { reasonId: r.reasonId, loopId: r.id } });
}

/** The Reason Session a run opened, in the web app. */
export function sessionUrl(sessionId: string): string {
  return `https://reasonmachines.com/agents/${encodeURIComponent(sessionId)}`;
}

/** The routine's own link (Conductor's "Copy link" deep link, `conductor://…`). */
export function routineLink(r: Pick<Routine, "id" | "reasonId">): string {
  return `openconductor://routines/${encodeURIComponent(r.id)}?reason=${encodeURIComponent(r.reasonId)}`;
}
