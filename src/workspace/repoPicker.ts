// "Add repository" choices in the create-workspace dialog: open a local
// project or clone one. Strings follow Conductor's copy catalog
// (evidence/create-workspace/README.md); the URL rules are ours.
import type { Repo } from "../state/types";

export const CLONE_PLACEHOLDER = "Choose a recent repo or paste a clone URL.";
export const CLONE_DESTINATION_TITLE = "Choose where to clone the repository";
export const CLONING = "Cloning repository...";
export const REPO_EXISTS = "This repository already exists.";
export const INVALID_CLONE_URL = "Enter a clone URL (https or git@), or owner/name for GitHub.";
export const FAILED_TO_CLONE = "Failed to clone repository";

export interface CloneSource {
  /** What `git clone` receives. owner/name becomes a GitHub https URL. */
  url: string;
  /** Directory the clone lands in: the last path segment without `.git`. */
  name: string;
  /** host/owner/name, lower case: the same repository over https and ssh compares equal. */
  key: string;
}

const SEGMENT = /^[\w.-]+$/;

/** Parses a pasted clone URL. Returns null for anything `git clone` should not be given. */
export function parseCloneUrl(input: string): CloneSource | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const parts = splitRemote(raw);
  if (!parts) return null;
  const segments = parts.path.split("/").filter(Boolean);
  if (segments.length < 2 || !segments.every((s) => SEGMENT.test(s))) return null;
  const name = segments[segments.length - 1].replace(/\.git$/i, "");
  if (!name || name === "." || name === "..") return null;
  const url = parts.shorthand ? `https://github.com/${segments.join("/")}` : raw;
  return { url, name, key: remoteKey(parts.host, segments) };
}

/** host/owner/name key for a stored remote, or null when it is not a URL we understand. */
export function remoteKeyOf(remote: string | undefined): string | null {
  if (!remote) return null;
  const parts = splitRemote(remote.trim());
  if (!parts) return null;
  const segments = parts.path.split("/").filter(Boolean);
  return segments.length >= 2 ? remoteKey(parts.host, segments) : null;
}

function splitRemote(s: string): { host: string; path: string; shorthand: boolean } | null {
  const url = s.match(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)\/?$/i);
  if (url) return { host: url[1], path: url[2], shorthand: false };
  const scp = s.match(/^[\w.-]+@([^:/]+):(.+?)\/?$/);
  if (scp) return { host: scp[1], path: scp[2], shorthand: false };
  const short = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short && !s.startsWith(".")) return { host: "github.com", path: s, shorthand: true };
  return null;
}

function remoteKey(host: string, segments: string[]): string {
  const path = [...segments];
  path[path.length - 1] = path[path.length - 1].replace(/\.git$/i, "");
  return `${host.replace(/^www\./i, "")}/${path.join("/")}`.toLowerCase();
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+$/, "");
  return !!a && !!b && norm(a) === norm(b);
}

/** The sidebar repo a new local folder or clone URL would duplicate, if any. */
export function findExistingRepo(repos: Repo[], candidate: { path?: string; remote?: string }): Repo | undefined {
  const key = remoteKeyOf(candidate.remote);
  return repos.find(
    (r) => (candidate.path && samePath(r.path, candidate.path)) || (key !== null && remoteKeyOf(r.remote) === key),
  );
}

/** `<parent>/<name>`, joined without doubling a trailing slash. */
export function cloneDestination(parentDir: string, name: string): string {
  return `${parentDir.replace(/[\\/]+$/, "")}/${name}`;
}

export function cloneFailedMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return detail ? `${FAILED_TO_CLONE}: ${detail}` : FAILED_TO_CLONE;
}
