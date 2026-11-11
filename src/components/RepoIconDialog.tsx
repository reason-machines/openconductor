import { useRef, useState } from "react";
import type { Repo } from "../state/types";
import { emojiIcon, fitIcon, githubAvatarUrl, parseRepoIcon, UPLOAD_MAX_BYTES, UPLOAD_MAX_DIMENSION, uploadMimeType } from "../state/repoIcon";
import { Modal } from "./Dialogs";
import { CloseIcon, SearchIcon } from "./Icons";
import { REPO_ICONS } from "./repoIcons.generated";
import { searchEmoji } from "./repoEmoji";
import { isRepoIconName, RepoIconGlyph, useRepoFavicon } from "./RepoIcon";

type Tab = "icons" | "emoji" | "favicon" | "upload";
const TABS: [Tab, string][] = [["icons", "Icons"], ["emoji", "Emoji"], ["favicon", "Favicon"], ["upload", "Upload"]];
const ICON_NAMES = Object.keys(REPO_ICONS).sort();

interface Props {
  repo: Repo;
  /** null clears the icon (favicon, then GitHub avatar, then the initial). */
  onChange: (icon: string | null) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

/**
 * "Change icon for <repo>" (Conductor's change-repo-icon dialog, `Lya` / `dUi` in the decoded
 * renderApp-D_fmY7hW.js @11015415 / @10807619): four tabs that each set `repos.icon` and close.
 */
export function RepoIconDialog(props: Props) {
  return (
    <Modal title={`Change icon for ${props.repo.name}`} onClose={props.onClose}>
      <RepoIconPicker {...props} />
    </Modal>
  );
}

export function RepoIconPicker({ repo, onChange, onClose, onError }: Props) {
  const [tab, setTab] = useState<Tab>("icons");
  const pick = (icon: string | null) => {
    onChange(icon);
    onClose();
  };
  return (
    <div className="repo-icon-dialog">
      <div className="repo-icon-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="repo-icon-tab" data-active={tab === id || undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="repo-icon-panel">
        {tab === "icons" && <IconsTab repo={repo} pick={pick} />}
        {tab === "emoji" && <EmojiTab repo={repo} pick={pick} />}
        {tab === "favicon" && <FaviconTab repo={repo} pick={pick} />}
        {tab === "upload" && <UploadTab repo={repo} pick={pick} onError={onError} />}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder, onClear, clearLabel }: { value: string; onChange: (v: string) => void; placeholder: string; onClear?: () => void; clearLabel: string }) {
  return (
    <div className="repo-icon-search">
      <SearchIcon size={14} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
      {onClear && (
        <button type="button" className="icon-btn" aria-label={clearLabel} title={clearLabel} onClick={onClear}>
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}

function IconsTab({ repo, pick }: { repo: Repo; pick: (icon: string | null) => void }) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();
  const names = q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES;
  return (
    <>
      <SearchBar value={query} onChange={setQuery} placeholder="Search icons" clearLabel="Remove icon" onClear={repo.icon ? () => pick(null) : undefined} />
      <div className="repo-icon-grid">
        {names.map((name) => (
          <button key={name} type="button" className="repo-icon-cell" title={name} aria-label={name} data-selected={repo.icon === name || undefined} onClick={() => pick(name)}>
            <RepoIconGlyph name={name} size={20} />
          </button>
        ))}
      </div>
    </>
  );
}

function EmojiTab({ repo, pick }: { repo: Repo; pick: (icon: string | null) => void }) {
  const [query, setQuery] = useState("");
  const current = parseRepoIcon(repo.icon, isRepoIconName);
  const selected = current?.kind === "emoji" ? current.emoji : null;
  const choices = searchEmoji(query);
  return (
    <>
      <SearchBar value={query} onChange={setQuery} placeholder="Search emoji" clearLabel="Remove emoji" onClear={repo.icon ? () => pick(null) : undefined} />
      {choices.length === 0 && <p className="muted" role="status">No emoji found</p>}
      <div className="repo-icon-grid">
        {choices.map(([emoji, name]) => (
          <button key={emoji} type="button" className="repo-icon-cell repo-icon-emoji-cell" title={name} aria-label={name} data-selected={selected === emoji || undefined} onClick={() => pick(emojiIcon(emoji) ?? null)}>
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

function FaviconTab({ repo, pick }: { repo: Repo; pick: (icon: string | null) => void }) {
  const favicon = useRepoFavicon(repo.path || undefined);
  const avatar = githubAvatarUrl(repo.remote);
  const using = !repo.icon;
  return (
    <div className="repo-icon-pane">
      <div className="repo-icon-preview">
        {favicon ? (
          <>
            <img src={favicon} alt="Detected favicon" />
            <button type="button" className={using ? "btn btn-small repo-icon-using" : "btn btn-small"} onClick={() => pick(null)}>{using ? "Using favicon" : "Use favicon"}</button>
          </>
        ) : avatar ? (
          <>
            <img src={avatar} alt="GitHub avatar" />
            <button type="button" className={using ? "btn btn-small repo-icon-using" : "btn btn-small"} onClick={() => pick(null)}>{using ? "Using GitHub avatar" : "Use GitHub avatar"}</button>
          </>
        ) : (
          <>
            <span className="repo-icon-big-initial">{repo.name.charAt(0).toUpperCase()}</span>
            <p className="muted">No favicon detected</p>
          </>
        )}
      </div>
      <p className="repo-icon-note">
        OpenConductor checks common locations in the repository, such as <code>public/favicon.svg</code> and <code>apple-touch-icon.png</code>.
      </p>
    </div>
  );
}

async function resizeToDataUrl(file: File, mime: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: mime }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Failed to decode image"));
      i.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w > UPLOAD_MAX_DIMENSION || h > UPLOAD_MAX_DIMENSION) throw new Error(`Image dimensions ${w}x${h} exceed the ${UPLOAD_MAX_DIMENSION}px limit`);
    const fit = fitIcon(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = fit.canvas;
    canvas.height = fit.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, fit.x, fit.y, fit.width, fit.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function UploadTab({ repo, pick, onError }: { repo: Repo; pick: (icon: string | null) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const current = parseRepoIcon(repo.icon, isRepoIconName);
  const uploaded = current?.kind === "image" ? current.src : null;
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const mime = uploadMimeType(file.name);
    if (!mime) return onError("Choose a PNG, JPEG, GIF, WebP, or SVG image.");
    if (file.size > UPLOAD_MAX_BYTES) return onError("Image is too large. Choose one under 10 MB.");
    setBusy(true);
    try {
      pick(await resizeToDataUrl(file, mime));
    } catch (err) {
      console.error("repository icon upload failed", err);
      onError("Could not set the icon. Try a different image.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="repo-icon-pane">
      <div className="repo-icon-preview">
        {uploaded ? <img src={uploaded} alt="Uploaded icon" /> : <span className="repo-icon-big-initial" aria-hidden>+</span>}
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>{uploaded ? "Replace image…" : "Choose image…"}</button>
        <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.gif,.webp,.svg" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      <p className="repo-icon-note">PNG, JPEG, GIF, WebP or SVG, up to 10 MB. The image is scaled down to icon size.</p>
    </div>
  );
}
