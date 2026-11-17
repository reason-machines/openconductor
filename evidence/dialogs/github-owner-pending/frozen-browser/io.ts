import type { GitHubOwners } from "../../../../src/state/githubRepoDialog";
export const requests: { args: { owner: string; repoPath: string; repositoryName: string; existingOriginUrl?: string }; resolve: (value: { originRemoteUrl: string }) => void; reject: (error: Error) => void }[] = [];
export const checks: string[] = [];
export const added: string[] = [];
export const errors: string[] = [];
export let closes = 0;
let ownersResolve: ((value: GitHubOwners) => void) | undefined;
export function githubRepoOwners() { return new Promise<GitHubOwners>(resolve => { ownersResolve = resolve; }); }
export function loadOwners() { ownersResolve?.({ owners: [{ login: "person", kind: "user" }, { login: "team", kind: "org" }], orgsError: null }); }
export async function githubRepoAvailability(owner: string, name: string) { checks.push(`${owner}/${name}`); return "available"; }
export function githubRepoCreate(args: typeof requests[number]["args"]) { return new Promise<{ originRemoteUrl: string }>((resolve, reject) => requests.push({ args: { ...args }, resolve, reject })); }
export function settle(kind: "reject" | "resolve") { const request = requests.at(-1); if (!request) return; if (kind === "reject") request.reject(new Error("Synthetic creation rejected")); else request.resolve({ originRemoteUrl: `https://example.invalid/${request.args.owner}/notes.git` }); }
export function closed() { closes++; }
