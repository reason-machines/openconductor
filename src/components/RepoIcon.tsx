import { useEffect, useState } from "react";
import type { Repo } from "../state/types";
import { githubAvatarUrl, parseRepoIcon } from "../state/repoIcon";
import { REPO_ICONS, type IconNode } from "./repoIcons.generated";
import { repoFavicon } from "../backend";

export const isRepoIconName = (name: string) => Object.prototype.hasOwnProperty.call(REPO_ICONS, name);

/** One bundled repo icon (Lucide shape) at `size` px, stroked in the current colour. */
export function RepoIconGlyph({ name, size = 16 }: { name: string; size?: number }) {
  const node: IconNode | undefined = REPO_ICONS[name];
  if (!node) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {node.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...attrs} />;
      })}
    </svg>
  );
}

// Favicons found in a repository, looked up once per path per app run (Conductor caches them with staleTime Infinity).
const faviconCache = new Map<string, Promise<string | null>>();
export function useRepoFavicon(rootPath: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!rootPath) return setSrc(null);
    let live = true;
    let p = faviconCache.get(rootPath);
    if (!p) {
      p = repoFavicon(rootPath).catch(() => null);
      faviconCache.set(rootPath, p);
    }
    p.then((v) => live && setSrc(v));
    return () => {
      live = false;
    };
  }, [rootPath]);
  return src;
}
/** Forget a cached favicon, e.g. after the icon picker's Favicon tab is used. */
export const forgetRepoFavicon = (rootPath: string) => faviconCache.delete(rootPath);

/**
 * The icon next to a repo name (Conductor's `U9`): emoji, then an uploaded image or bundled icon,
 * then a favicon found in the repository, then the GitHub owner's avatar, then the initial.
 */
export function RepoIcon({ repo, className = "sb-repo-initial" }: { repo: Pick<Repo, "name" | "path" | "remote" | "icon">; className?: string }) {
  const value = parseRepoIcon(repo.icon, isRepoIconName);
  const favicon = useRepoFavicon(value ? undefined : repo.path || undefined);
  const avatar = githubAvatarUrl(repo.remote);
  const [avatarFailed, setAvatarFailed] = useState(false);
  if (value?.kind === "emoji") return <span className="repo-icon repo-icon-emoji" aria-hidden>{value.emoji}</span>;
  if (value?.kind === "image") return <img className="repo-icon" src={value.src} alt="" aria-hidden />;
  if (value?.kind === "icon") return <span className="repo-icon repo-icon-glyph" aria-hidden><RepoIconGlyph name={value.name} size={14} /></span>;
  if (favicon) return <img className="repo-icon" src={favicon} alt="" aria-hidden />;
  if (avatar && !avatarFailed) return <img className="repo-icon repo-icon-avatar" src={avatar} alt="" aria-hidden onError={() => setAvatarFailed(true)} />;
  return <span className={className} aria-hidden>{repo.name.charAt(0).toUpperCase()}</span>;
}
