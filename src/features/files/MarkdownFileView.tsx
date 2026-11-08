import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri, openUrl } from "../../backend";
import { useSettings } from "../../settings/useSettings";
import { enumPref } from "../../settings/prefs";
import { useAppPrefs, recordOpenIn } from "../../settings/appPrefs";
import { defaultAppId, loadOpenInApps, openInApp } from "../openIn/apps";
import { absolutePath } from "./tree";
import { MarkdownFileBody } from "./markdownFileBody";
import { readMarkdown, type MarkdownRead } from "./readMarkdown";
import "./markdownFile.css";

export function MarkdownFileView({ worktree, path }: { worktree: string; path: string }) {
  const [load, setLoad] = useState<MarkdownRead>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const savedApp = useAppPrefs().default_open_in;
  const openExternal = async () => {
    try {
      const apps = await loadOpenInApps();
      const id = defaultAppId(apps, savedApp);
      if (!id) throw new Error("No app to open files in");
      await openInApp(id, absolutePath(worktree, path));
      await recordOpenIn(id, false);
    } catch (e) { setError(String(e)); }
  };
  useEffect(() => {
    return readMarkdown(async () => {
      if (!inTauri()) throw new Error("Reading workspace files needs the desktop app.");
      return invoke<string>("workspace_read_markdown", { repo: worktree, path });
    }, setLoad);
  }, [worktree, path]);
  return <section className="markdown-file-view" aria-label={`File ${path}`}>
    <header className="markdown-file-toolbar">
      <span className="markdown-file-path" title={path}>{path}</span>
      <span>Preview</span>
      <button className="btn btn-small" onClick={() => void openExternal()}>Open externally</button>
    </header>
    {error && <p role="alert" className="error">{error}</p>}
    {load.kind === "loading" ? <p role="status">Loading file…</p> : load.kind === "error" ?
      <p role="alert" className="error">{load.message}</p> :
      <MarkdownFileBody text={load.text} style={settings ? enumPref(settings, "markdown_style") : undefined} onOpenLink={(href) => void openUrl(href)} />}
  </section>;
}
