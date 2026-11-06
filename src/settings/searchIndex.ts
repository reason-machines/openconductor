// Conductor's "Search settings" index and ranking (renderApp-D_fmY7hW.js: `yUi` pages
// @10,869,819, `xUi` rows @10,871,526, `a9a` search @11,250,104, `NM`/`qet` keywords,
// `vUi` per-page extra keywords @10,867,155). Pages come first, each agent tab right after
// Agents, then every row in Conductor's `fUi` order; a query ranks them by the best fuzzysort score over label,
// description and keywords (threshold 0.5) and keeps the first 30.
import { rankByFields, type FieldMatch } from "../keybindings/fuzzy.ts";
import type { SettingsPage } from "./pages.ts";
import { REPO_SECTION_LABELS, type RepoSection } from "./routes.ts";
import { SEARCH_ROWS } from "./searchRows.generated.ts";

/** Where a result goes: a user page (an Agents tab, a row to scroll to) or a repository section. */
export type SearchTarget =
  | { scope: "user"; page: SettingsPage; providerTab?: string; row?: string }
  | { scope: "repo"; section: RepoSection; row?: string };

export interface SearchItem {
  id: string;
  label: string;
  /** The page a row lives on (Conductor's `tabLabel`); pages themselves have none. */
  tabLabel?: string;
  description?: string;
  keywords: string[];
  /** Icon key: a user page id, a repository section, or an agent tab. */
  icon: string;
  target: SearchTarget;
}

export type SearchField = "label" | "description" | "keywords";
export interface SearchResult {
  item: SearchItem;
  match: FieldMatch<SearchField>;
}

/** Conductor's `o9a`. */
export const MAX_RESULTS = 30;

const EXTRA_KEYWORDS: Record<string, string[]> = {
  general: ["preferences", "config", "notifications", "sound", "send"],
  account: ["user", "profile", "login", "sign in", "github"],
  models: ["thinking", "plan", "fast", "cursor", "composer"],
  providers: ["harness", "api", "key", "agents"],
  environment: ["env", "vars", "env vars", "variables", "secrets", "path"],
  git: ["branch", "version", "control", "commit"],
  scripts: ["setup script", "archive script", "run", "files to copy"],
  actions: ["spotlight", "code review", "fix errors", "preferences"],
  misc: ["repository", "root path", "workspaces path"],
  appearance: ["theme", "colors", "display", "dark", "light"],
  "key-bindings": ["keyboard", "keys", "hotkeys", "shortcuts", "configure"],
  experimental: ["beta", "labs", "features"],
  advanced: ["storage", "data", "database"],
  terminal: ["shell", "mode"],
};

/** Conductor's `qet`: "settings", the label, its words, then the extras. */
export function keywordsFor(label: string, extra: readonly string[] = []): string[] {
  const l = label.toLowerCase();
  return [...new Set(["settings", l, ...l.split(/\s+/), ...extra])];
}

/** Agent tabs listed under Agents (Conductor's `Lba`: label and extra keywords). */
const AGENT_KEYWORDS: Record<string, string[]> = { claude: ["anthropic"], codex: ["openai"] };

export interface IndexInput {
  /** User pages in nav order, with their labels. */
  pages: readonly { id: SettingsPage; label: string }[];
  /** Agents page tabs, in order. */
  agentTabs: readonly { id: string; label: string }[];
  /** Whether repository sections can be opened (a repository exists). */
  hasRepos: boolean;
}

const REPO_ONLY: readonly RepoSection[] = ["scripts", "actions", "misc"];

export function buildSearchIndex({ pages, agentTabs, hasRepos }: IndexInput): SearchItem[] {
  const labels = new Map<string, string>(pages.map((p) => [p.id, p.label]));
  const items: SearchItem[] = [];
  for (const p of pages) {
    items.push({ id: p.id, label: p.label, icon: p.id, keywords: keywordsFor(p.label, EXTRA_KEYWORDS[p.id]), target: { scope: "user", page: p.id } });
    if (p.id === "providers") {
      for (const t of agentTabs)
        items.push({
          id: `provider-${t.id}`,
          label: t.label,
          icon: `provider-${t.id}`,
          keywords: keywordsFor(t.label, ["harness", "harnesses", "provider", t.id, ...(AGENT_KEYWORDS[t.id] ?? [])]),
          target: { scope: "user", page: "providers", providerTab: t.id },
        });
    }
  }
  if (hasRepos)
    for (const s of REPO_ONLY)
      items.push({ id: s, label: REPO_SECTION_LABELS[s], icon: s, keywords: keywordsFor(REPO_SECTION_LABELS[s], EXTRA_KEYWORDS[s]), target: { scope: "repo", section: s } });
  for (const r of SEARCH_ROWS) {
    const repo = r.scope === "repo";
    if (repo && !hasRepos) continue;
    if (!repo && !labels.has(r.tab)) continue;
    const tabLabel = repo ? REPO_SECTION_LABELS[r.tab as RepoSection] : labels.get(r.tab);
    items.push({
      id: `row-${r.tab}-${r.label}`,
      label: r.label,
      tabLabel,
      description: r.description ?? undefined,
      icon: r.tab,
      keywords: keywordsFor(r.label, [...(tabLabel ? [tabLabel.toLowerCase()] : []), ...r.searchTerms]),
      target: repo ? { scope: "repo", section: r.tab as RepoSection, row: r.label } : { scope: "user", page: r.tab as SettingsPage, row: r.label },
    });
  }
  return items;
}

/** Conductor's `a9a` query: nothing for a blank query, else the best 30 matches. */
export function searchSettings(items: readonly SearchItem[], query: string): SearchResult[] {
  if (query.trim() === "") return [];
  return rankByFields<SearchItem, SearchField>(items, query, {
    label: (i) => i.label,
    description: (i) => i.description ?? "",
    keywords: (i) => i.keywords.join(" "),
  }).slice(0, MAX_RESULTS);
}
