// Placeholder workspace naming. How the reference app names new workspaces is
// still an open evidence item (see evidence/README.md); this is our own scheme.
const ADJECTIVES = ["amber", "brisk", "cedar", "dusky", "ember", "fable", "gusty", "hazel", "ivory", "jolly", "keen", "lunar", "misty", "noble", "opal", "plume", "quiet", "rapid", "sable", "tidal"];
const NOUNS = ["harbor", "falcon", "meadow", "comet", "ridge", "otter", "lantern", "willow", "summit", "delta", "maple", "orbit", "pebble", "quill", "reef", "spruce", "tundra", "vale", "wren", "zephyr"];

export function workspaceName(taken: Set<string>): string {
  for (let i = 0; i < 200; i++) {
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const name = `${a}-${n}`;
    if (!taken.has(name)) return name;
  }
  return `workspace-${Date.now().toString(36)}`;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** "owner/name" or a GitHub URL -> repo name. Returns null when not parseable. */
export function repoNameFromGithub(input: string): { owner: string; name: string } | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m =
    s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)$/i) ??
    s.match(/^git@github\.com:([\w.-]+)\/([\w.-]+)$/i) ??
    s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

export function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
