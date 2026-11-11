// Settings › Cloud setup: what the page shows for the Reason login's cloud
// readiness. Pure, so cloudSetup.test.ts covers it.
//
// Conductor 0.87.6's page (`Hua`, renderApp-D_fmY7hW.js @10,298,246,
// REA-read on sven m5 max) is a three-step checklist: its plan ("Conductor
// Pro", always done for the users who see it), "Agents" (an agent API key)
// and "GitHub" (`Pet`: GitHub access), counted "n/3" beside the title, then
// "You're all set up!" and "Launch a cloud workspace" once every step is
// done (`Gua`, which opens the create dialog with `hostingTarget: "cloud"`).
//
// OpenConductor's cloud is Reason: a cloud workspace is a Reason Session on
// a Reason cloud computer. Each step is read from the Reason HTTP API
// through the user's own `reason` login (src-tauri/src/reason_acp/cloud.rs):
// the plan is the signed-in Reason workspace with cloud access and credit,
// agents is Reason's managed inference, GitHub is the repositories the
// workspace's GitHub App reaches.

/** One `getSelfReadiness` check, as `reason_cloud_setup` returns it. */
export interface ReadinessCheck {
  status: "ready" | "blocked" | "unknown" | "not_applicable" | string;
  detail: string;
  actions: { code: string; actor: string; action: string }[];
}

/** `reason_cloud_setup` (Rust `CloudSetup`). */
export interface CloudSetupDto {
  signedIn: boolean;
  identity: {
    email: string | null;
    name: string | null;
    workspaceName: string | null;
    workspaceSlug: string | null;
    cloudReady: boolean | null;
  } | null;
  funding: ReadinessCheck | null;
  agentsAvailable: boolean | null;
  repositories: string[] | null;
  error: { code: string; message: string } | null;
}

/** Conductor's `PZn`. */
export const CLOUD_SETUP_STEPS = 3;

export const REASON_DOCS_URL = "https://docs.reasonmachines.com/docs/build/computers";
export const REASON_PLAN_URL = "https://reasonmachines.com/customize";
export const REASON_GITHUB_URL = "https://reasonmachines.com/customize?tab=plugins&plugin=github";

/** A step's mark: done (circle-check), to do (circle-dashed), or not known yet. */
export type StepState = "done" | "todo" | "unknown";

export interface CloudSetupView {
  plan: StepState;
  agents: StepState;
  github: StepState;
  /** Steps done, for "n/3"; undefined while loading (Conductor hides the suffix then). */
  done: number | undefined;
  complete: boolean;
}

const tri = (v: boolean | null | undefined): StepState => (v === true ? "done" : v === false ? "todo" : "unknown");

/**
 * The plan step: signed in, the workspace has cloud access (`cloud_activation.ready`,
 * when the deployment reports it) and its funding check is not blocked.
 */
export function planState(s: CloudSetupDto): StepState {
  if (!s.signedIn) return s.error?.code === "authentication_required" ? "todo" : "unknown";
  if (s.identity?.cloudReady === false || s.funding?.status === "blocked") return "todo";
  return "done";
}

export function cloudSetupView(s: CloudSetupDto | null): CloudSetupView {
  if (!s) return { plan: "unknown", agents: "unknown", github: "unknown", done: undefined, complete: false };
  const plan = planState(s);
  const agents = tri(s.agentsAvailable);
  const github = s.repositories === null ? "unknown" : tri(s.repositories.length > 0);
  const states = [plan, agents, github];
  const done = states.filter((x) => x === "done").length;
  return { plan, agents, github, done, complete: done === CLOUD_SETUP_STEPS };
}

/** "1/3" beside the title, as Conductor's `Z3 titleSuffix`. */
export const progressLabel = (v: CloudSetupView): string | undefined => (v.done === undefined ? undefined : `${v.done}/${CLOUD_SETUP_STEPS}`);

/** The plan step's description. */
export function planDescription(s: CloudSetupDto | null): string {
  if (!s) return "Checking your Reason account…";
  if (!s.signedIn) {
    if (s.error?.code === "authentication_required") return "Sign in to Reason to run workspaces in the cloud. Each cloud workspace is a Reason Session on a Reason cloud computer.";
    return s.error?.message ?? "Couldn't reach Reason.";
  }
  const where = s.identity?.workspaceName ? ` in ${s.identity.workspaceName}` : "";
  const who = s.identity?.email ?? s.identity?.name;
  if (s.identity?.cloudReady === false) return `Reason cloud isn't active${where} yet. Activate it in Reason to run workspaces in the cloud.`;
  if (s.funding?.status === "blocked") return s.funding.actions[0]?.action ?? s.funding.detail;
  return `Signed in${who ? ` as ${who}` : ""}${where}. Cloud workspaces run as Reason Sessions on Reason cloud computers.`;
}

/** The GitHub step's line under its option: how many repositories Reason reaches. */
export function githubSummary(s: CloudSetupDto | null): string {
  if (!s || (s.signedIn && s.repositories === null && !s.error)) return "Checking repositories…";
  if (!s.signedIn) return "Sign in to Reason first.";
  if (s.repositories === null) return "Couldn't list repositories.";
  const n = s.repositories.length;
  if (n === 0) return "No repositories yet. Connect GitHub in Reason and pick the repositories it can reach.";
  return `Reaches ${n} ${n === 1 ? "repository" : "repositories"}.`;
}

/** `owner/name` of a GitHub remote URL (https, ssh or scp form); undefined otherwise. */
export function githubFullName(remoteUrl: string | null | undefined): string | undefined {
  if (!remoteUrl) return undefined;
  const m = remoteUrl.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

/** Whether Reason reaches the repository at `remoteUrl` (Conductor's `selectedRepoSupportsCloud`). */
export function repoSupportsCloud(s: CloudSetupDto | null, remoteUrl: string | null | undefined): boolean {
  const name = githubFullName(remoteUrl)?.toLowerCase();
  return !!name && !!s?.repositories?.some((r) => r.toLowerCase() === name);
}
