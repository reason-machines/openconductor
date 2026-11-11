// parity:diff.file-render:ui
// The path at the left of the diff tab's file header, as Conductor draws it
// (REA, renderApp 0.87.6: NPo @8,916,282 puts `tee` there with fileIsPrimary,
// inline false; `tee` renders the outline pill `QZ` @6,088,173): an h-5
// rounded-sm outline button, px-1.5 gap-1, text-xs, with the file-type icon
// (size-3) and the path as `bj` draws it, the directory in the link colour and
// the file name in the foreground. A rename reads "old → new". Clicking it opens
// the file in the default "Open in" app, whose name is the tooltip.
import { FileTypeIcon } from "../../components/FileIcons";
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { useAppPrefs } from "../../settings/appPrefs";
import { defaultAppId, openInApp } from "../openIn/apps";
import { useInstalledApps } from "../openIn/OpenInButton";

/** `bj`: "src/lib/" and "auth.ts", or the whole path when it has no directory. */
export function splitPath(path: string): { directory: string; fileName: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { directory: "", fileName: path } : { directory: path.slice(0, i + 1), fileName: path.slice(i + 1) };
}

function PathLabel({ path }: { path: string }) {
  const { directory, fileName } = splitPath(path);
  if (!directory) return <span className="oc-path-name">{path}</span>;
  return (
    <span className="oc-path-label">
      <span className="oc-path-dir">{directory}</span>
      <span className="oc-path-name">{fileName}</span>
    </span>
  );
}

interface Props {
  path: string;
  oldPath?: string | null;
  /** The workspace's checkout; the chip opens `worktree/path`. */
  worktree?: string | null;
  notify?: (kind: "info" | "error", message: string) => void;
}

export function FilePathChip({ path, oldPath, worktree, notify }: Props) {
  const apps = useInstalledApps() ?? [];
  const appId = defaultAppId(apps, useAppPrefs().default_open_in);
  const app = apps.find((a) => a.id === appId);
  const full = worktree ? `${worktree}/${path}` : null;
  const open = () => {
    if (!full || !appId) return;
    openInApp(appId, appId === "alacritty" && worktree ? worktree : full).catch((err) => notify?.("error", `Failed to open in ${app?.name ?? appId}: ${err instanceof Error ? err.message : String(err)}`));
  };
  const chip = (
    <button type="button" className="oc-path-chip" onClick={open} aria-label={path} title={app && full ? undefined : path}>
      <FileTypeIcon path={path} size={12} />
      <span className="oc-path-chip-text">
        {oldPath ? (
          <>
            <PathLabel path={oldPath} />
            <span className="oc-path-arrow">→</span>
            <PathLabel path={path} />
          </>
        ) : (
          <PathLabel path={path} />
        )}
      </span>
    </button>
  );
  return app && full ? <Tooltip content={`Open in ${app.name}`}>{chip}</Tooltip> : chip;
}
