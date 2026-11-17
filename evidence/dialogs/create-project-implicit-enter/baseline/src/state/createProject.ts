// "Create project" dialog (Home → Quick start): the pure parts (name hint,
// templates, validation, step texts, Next.js scripts, error text). Behaviour
// follows evidence/screens/create-project.md.

import { repoSlug } from "./githubRepoDialog.ts";

export const DEFAULT_PROJECT_NAME = "openconductor-playground";

/** gstack (a third-party template) is left out until the user decides on it. */
export type TemplateId = "empty" | "nextjs";

export interface Template {
  id: TemplateId;
  label: string;
  description: string;
}

export const TEMPLATES: readonly Template[] = [
  { id: "empty", label: "Empty", description: "Blank Git repo" },
  { id: "nextjs", label: "Next.js", description: "TypeScript, Tailwind, App Router" },
];

/** The folder and GitHub repo name: the GitHub repo dialog's slug. */
export const projectSlug = repoSlug;

export type NameHint = { kind: "creates"; slug: string } | { kind: "invalid" } | null;

/** The line under the name: the slug it creates, an error, or nothing for an empty name. */
export function nameHint(name: string): NameHint {
  const trimmed = name.trim();
  const slug = projectSlug(trimmed);
  if (slug) return { kind: "creates", slug };
  return trimmed ? { kind: "invalid" } : null;
}

/** The first validation error, checked in this order, or null. */
export function validateCreate(slug: string, parent: string): string | null {
  if (!slug.trim()) return "Enter a project name";
  if (!parent.trim()) return "Select a directory";
  return null;
}

export function canCreate(slug: string, parent: string, pending: boolean): boolean {
  return !pending && !!slug && !!parent;
}

export function createButtonLabel(pending: boolean): string {
  return pending ? "Creating..." : "Create";
}

export const STEP = {
  createDirectory: "Creating project directory...",
  gitInit: "Initializing Git repository...",
  createNext: "Creating Next.js project...",
  setupEnv: "Setting up environment...",
  githubRepo: "Creating GitHub repo...",
  addProject: "Adding project...",
  createWorkspace: "Creating workspace...",
} as const;

export type StepText = (typeof STEP)[keyof typeof STEP];

/** Step texts in the order the pipeline shows them. */
export function pipelineSteps(template: TemplateId): StepText[] {
  const scaffold = template === "nextjs" ? [STEP.createNext, STEP.setupEnv] : [STEP.createDirectory, STEP.gitInit];
  return [...scaffold, STEP.githubRepo, STEP.addProject, STEP.createWorkspace];
}

export interface RepoScripts {
  setup: string;
  run: string;
  runMode: "concurrent";
}

/** Scripts set on the new repo; only the Next.js template sets any. */
export function templateScripts(template: TemplateId): RepoScripts | null {
  if (template !== "nextjs") return null;
  return {
    setup: "ln -sf $CONDUCTOR_ROOT_PATH/.env.local .env.local && pnpm install",
    run: "pnpm run dev",
    runMode: "concurrent",
  };
}

export function targetPath(parent: string, slug: string): string {
  return `${parent.trim().replace(/\/+$/, "")}/${slug}`;
}

export function existsMessage(slug: string, parent: string): string {
  return `Directory "${slug}" already exists in ${parent}`;
}

/** create-next-app's failure: its last non-empty output line, else a fallback. */
export function nextFailureMessage(log: readonly string[]): string {
  const last = log.map((l) => l.trim()).filter(Boolean).pop();
  return last || "Failed to create Next.js project";
}

export function createFailedMessage(err: unknown): string {
  return `Couldn't create project: ${err instanceof Error ? err.message : String(err)}`;
}

export const SUCCESS_TOAST = "Project created.";
export const OPEN_IN_GITHUB = "Open in GitHub";
