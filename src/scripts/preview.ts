// The Run tab's Open button and terminal.openLocalhost (⌘⇧B): which URLs it
// offers and how each is resolved. Conductor 0.87.6, renderApp-D_fmY7hW.js,
// read with REA string search on sven m5 max (evidence/keybindings/README.md):
//   Fno / Bno / bzt  the localhost URL found in run output (last match wins)
//   UAt              port and display port of a localhost URL
//   gEi              template expansion: $((CONDUCTOR_PORT + N)), then $NAME
//   xii (index wE)   the variables a template may use, in this order
//   rl / Fl          options: the preview_urls setting, else the detected URL
import { stripAnsi } from "./model.ts";
import type { PreviewUrl } from "../settings/types.ts";

/** `wE`'s keys in its insertion order, which is the order `gEi` replaces them in. */
export const PREVIEW_ENV_KEYS = [
  "CONDUCTOR_WORKSPACE_NAME",
  "CONDUCTOR_WORKSPACE_PATH",
  "CONDUCTOR_ROOT_PATH",
  "CONDUCTOR_DEFAULT_BRANCH",
  "CONDUCTOR_PORT",
  "CONDUCTOR_USER_ID",
  "CONDUCTOR_IS_LOCAL",
] as const;

export type PreviewEnv = Partial<Record<(typeof PREVIEW_ENV_KEYS)[number], string>>;

/** Conductor reads the run terminal's last 1000 lines (`qc.getTranscript(id, 1e3)`). */
export const DETECT_LINES = 1000;

// `Fno`, verbatim.
const LOCALHOST_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|\[::\])(?::\d+)?(?:\/[^\s)]*)?/gi;
// `yJs`, verbatim: one digit only, as in Conductor.
const PORT_OFFSET = /\$\(\(\s*CONDUCTOR_PORT\s*\+\s*([0-9])\s*\)\)/g;

/** `Bno`: 0.0.0.0, [::1] and [::] open as localhost. */
function normalizeHost(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "0.0.0.0" || u.hostname === "[::1]" || u.hostname === "[::]") {
      u.hostname = "localhost";
      return u.toString();
    }
  } catch {
    return url;
  }
  return url;
}

/** `bzt`: the last localhost URL in the output's last 1000 lines, or null. */
export function detectLocalhostUrl(output: string): string | null {
  const lines = output.split("\n");
  const tail = lines.length > DETECT_LINES ? lines.slice(-DETECT_LINES).join("\n") : output;
  const found = stripAnsi(tail).match(LOCALHOST_URL);
  return found && found.length > 0 ? normalizeHost(found[found.length - 1]) : null;
}

export interface LocalhostInfo {
  url: string;
  port: number;
  /** The port as written, or the protocol's default. */
  displayPort: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1", "[::]", "::"]);

/** `UAt`: port details when `url` points at this machine, else undefined. */
export function localhostInfo(url: string): LocalhostInfo | undefined {
  try {
    const u = new URL(url);
    if (!LOCAL_HOSTS.has(u.hostname.toLowerCase())) return undefined;
    const fallback = u.protocol === "http:" ? 80 : u.protocol === "https:" ? 443 : undefined;
    const port = u.port ? Number(u.port) : fallback;
    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
    return { url, port, displayPort: u.port || String(port) };
  } catch {
    return undefined;
  }
}

/** `gEi`: expand $((CONDUCTOR_PORT + N)) first, then each `$NAME` in `PREVIEW_ENV_KEYS` order. */
export function resolvePreviewUrl(template: string, env: PreviewEnv): string {
  let out = template;
  const port = env.CONDUCTOR_PORT;
  if (port !== undefined) out = out.replace(PORT_OFFSET, (_, n: string) => String(Number(port) + Number(n)));
  for (const key of PREVIEW_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) out = out.split(`$${key}`).join(value);
  }
  return out;
}

export interface PreviewOption {
  /** The URL as configured or detected. */
  rawUrl: string;
  resolvedUrl: string;
  /** The name, else the resolved URL (`Fl`). */
  label: string;
  /** Shown after "Open" for a localhost URL. */
  displayPort?: string;
}

/**
 * `rl` / `Fl`: the repository's preview URLs (the first is the default) when
 * any has a URL, else the URL detected in the run output, else none.
 */
export function previewOptions(configured: readonly PreviewUrl[] | null | undefined, detected: string | null, env: PreviewEnv): PreviewOption[] {
  const set = (configured ?? []).filter((p) => p.url.trim() !== "").map((p) => ({ name: p.name ?? "", url: p.url }));
  const source = set.length > 0 ? set : detected !== null ? [{ name: "", url: detected }] : [];
  return source.map(({ name, url }) => {
    const resolvedUrl = resolvePreviewUrl(url, env);
    return { rawUrl: url, resolvedUrl, label: name.trim() || resolvedUrl, displayPort: localhostInfo(resolvedUrl)?.displayPort };
  });
}

/** Pairs from the backend (`run_script_preview_env`) as a lookup. */
export function previewEnvFrom(pairs: readonly (readonly [string, string])[]): PreviewEnv {
  const env: PreviewEnv = {};
  for (const [k, v] of pairs) if ((PREVIEW_ENV_KEYS as readonly string[]).includes(k)) env[k as keyof PreviewEnv] = v;
  return env;
}
