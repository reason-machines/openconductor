// Per-repository icon (`repos.icon`) as Conductor v0.87.6 stores it (REA:
// decoded renderApp-D_fmY7hW.js, `J$t` / `cXs` / `oEi` @6485160, `U9`
// @7161356): "emoji:<emoji>", an uploaded "data:image/..." URL, or the name of
// one of its bundled repo icons. With no icon set the sidebar shows a favicon
// found in the repository, then the GitHub owner's avatar, then the initial.

export const EMOJI_PREFIX = "emoji:";
const IMAGE_PREFIX = "data:image/";

export type RepoIconValue =
  | { kind: "emoji"; emoji: string }
  | { kind: "image"; src: string }
  | { kind: "icon"; name: string };

/** Decode `repos.icon`; `knownIcon` says whether a bundled icon has that name. */
export function parseRepoIcon(icon: string | null | undefined, knownIcon: (name: string) => boolean): RepoIconValue | null {
  if (!icon) return null;
  if (icon.startsWith(EMOJI_PREFIX)) {
    const emoji = icon.slice(EMOJI_PREFIX.length);
    return emoji ? { kind: "emoji", emoji } : null;
  }
  if (icon.startsWith(IMAGE_PREFIX)) return { kind: "image", src: icon };
  return knownIcon(icon) ? { kind: "icon", name: icon } : null;
}

/** `repos.icon` for an emoji; undefined for blank input. */
export function emojiIcon(emoji: string): string | undefined {
  const e = emoji.trim();
  return e ? `${EMOJI_PREFIX}${e}` : undefined;
}

/** Owner avatar for a github.com remote (https or scp-style ssh), else null. */
export function githubAvatarUrl(remote: string | null | undefined): string | null {
  if (!remote) return null;
  const m = remote.trim().match(/^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\//i);
  return m ? `https://github.com/${m[1]}.png?size=64` : null;
}

/** Uploaded images are drawn into a square of at most this many pixels. */
export const UPLOAD_ICON_SIZE = 128;
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MAX_DIMENSION = 10_000;
export const UPLOAD_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** MIME type for an upload's file name, or undefined when the extension is not accepted. */
export function uploadMimeType(fileName: string): string | undefined {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? UPLOAD_TYPES[ext] : undefined;
}

/** Canvas side and drawn size for an image of `w` x `h`: longest side scaled to at most 128, centered. */
export function fitIcon(w: number, h: number): { canvas: number; width: number; height: number; x: number; y: number } {
  const sourceWidth = w || UPLOAD_ICON_SIZE;
  const sourceHeight = h || UPLOAD_ICON_SIZE;
  const longest = Math.max(sourceWidth, sourceHeight);
  const canvas = Math.min(UPLOAD_ICON_SIZE, longest);
  const scale = canvas / longest;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return { canvas, width, height, x: (canvas - width) / 2, y: (canvas - height) / 2 };
}
