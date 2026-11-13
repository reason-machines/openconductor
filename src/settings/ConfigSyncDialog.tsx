import { useEffect, useRef, useState } from "react";
import { Modal } from "../components/Dialogs";
import { configSyncApi } from "./configSyncApi";
import { CONFIG_SYNC_CATEGORIES, CONFIG_SYNC_DIRECTIONS, configSyncItems, configSyncKey, type ConfigSyncCategory, type ConfigSyncDiff, type ConfigSyncResult } from "./configSync";
import "./configSync.css";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; diff: ConfigSyncDiff; result?: ConfigSyncResult; issue?: string }
  | { kind: "syncing"; diff: ConfigSyncDiff };

const message = (error: unknown) => error instanceof Error ? error.message : "Couldn't sync your local agent configs.";

export function ConfigSyncDialog({ onClose, notify }: { onClose: () => void; notify?: (kind: "info", message: string) => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<ConfigSyncCategory>>(() => new Set());
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void configSyncApi.diff().then(
      (diff) => { if (active) setState({ kind: "ready", diff }); },
      (error: unknown) => { if (active) setState({ kind: "error", message: message(error) }); },
    );
    return () => { active = false; mounted.current = false; };
  }, []);

  const close = () => { if (!pending.current) onClose(); };
  const diff = state.kind === "ready" || state.kind === "syncing" ? state.diff : undefined;
  const items = diff ? configSyncItems(diff) : [];
  const selected = items.filter((item) => !deselected.has(configSyncKey(item)));
  const toggleItem = (key: string) => setDeselected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleCategory = (category: ConfigSyncCategory) => {
    const keys = items.filter((item) => item.category === category).map(configSyncKey);
    setDeselected((current) => {
      const all = keys.every((key) => !current.has(key));
      const next = new Set(current);
      for (const key of keys) { if (all) next.add(key); else next.delete(key); }
      return next;
    });
  };
  const sync = async () => {
    if (state.kind !== "ready" || selected.length === 0 || pending.current) return;
    pending.current = true;
    setState({ kind: "syncing", diff: state.diff });
    try {
      const result = await configSyncApi.sync(selected);
      if (!mounted.current) return;
      if (result.successes > 0) notify?.("info", result.successes === 1 ? "Synced 1 item" : `Synced ${result.successes} items`);
      if (result.failures.length === 0 && result.unsupportedMcp.length === 0) {
        pending.current = false;
        onClose();
        return;
      }
      const next = await configSyncApi.diff();
      if (mounted.current) setState({ kind: "ready", diff: next, result });
    } catch (error) {
      if (mounted.current) setState({ kind: "ready", diff: state.diff, issue: message(error) });
    } finally { pending.current = false; }
  };

  return (
    <Modal title="Sync agent configs" dialogId="sync-agent-configs-dialog" onClose={close} disablePointerDismissal={state.kind === "syncing"}>
      <div className="config-sync-body" aria-busy={state.kind === "syncing" || state.kind === "loading"}>
        <p className="config-sync-description">Copy skills, slash commands, and MCP servers between Claude Code and Codex.</p>
        <p className="config-sync-note">Copies stay on this Mac. Existing items are not overwritten. Selected MCP definitions can include environment and header values.</p>
        {state.kind === "error" && <p role="alert" className="config-sync-error">{state.message}</p>}
        {state.kind === "ready" && state.issue && <p role="alert" className="config-sync-error">{state.issue}</p>}
        {state.kind === "loading" && <p role="status">Reading local agent configs…</p>}
        {CONFIG_SYNC_CATEGORIES.map(({ id, title, description }) => {
          const category = diff?.[id];
          const categoryItems = items.filter((item) => item.category === id);
          const count = categoryItems.filter((item) => !deselected.has(configSyncKey(item))).length;
          const all = categoryItems.length > 0 && count === categoryItems.length;
          const some = count > 0 && !all;
          const open = expanded.has(id);
          return (
            <section className="config-sync-category" key={id} aria-label={title}>
              <div className="config-sync-category-header">
                <input
                  type="checkbox" aria-label={`Select ${title}`} checked={all} aria-checked={some ? "mixed" : all}
                  ref={(input) => { if (input) input.indeterminate = some; }}
                  disabled={state.kind !== "ready" || categoryItems.length === 0} onChange={() => toggleCategory(id)}
                />
                <button type="button" className="config-sync-expand" aria-expanded={open} aria-controls={`config-sync-${id}`} disabled={!category || categoryItems.length === 0} onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}>
                  <span><strong>{title}</strong><span className="config-sync-description">{description}</span></span>
                  <span className="config-sync-count">{category?.error ? "—" : category ? categoryItems.length ? `${count} selected` : "No missing items" : "—"}</span>
                </button>
              </div>
              {category?.error && <p role="alert" className="config-sync-error">{category.error}</p>}
              {open && category && <div className="config-sync-items" id={`config-sync-${id}`}>
                {CONFIG_SYNC_DIRECTIONS.flatMap((direction) => category[direction].map((name) => {
                  const key = configSyncKey({ category: id, direction, name });
                  const from = direction === "ccToCodex" ? "Claude Code" : "Codex";
                  return <label className="config-sync-item" key={key}>
                    <input type="checkbox" aria-label={`${name} from ${from}`} checked={!deselected.has(key)} disabled={state.kind !== "ready"} onChange={() => toggleItem(key)} />
                    <span className="config-sync-from">From {from}</span><span className="config-sync-name">{name}</span>
                  </label>;
                }))}
              </div>}
            </section>
          );
        })}
        {state.kind === "ready" && state.result && <div role="status" className="config-sync-result">
          <p>Synced {state.result.successes} {state.result.successes === 1 ? "item" : "items"}.</p>
          {state.result.failures.map((failure, i) => <p className="config-sync-error" key={i}>{failure.name}: {failure.reason}</p>)}
          {state.result.unsupportedMcp.length > 0 && <p className="config-sync-error">Unsupported MCP servers: {state.result.unsupportedMcp.join(", ")}</p>}
        </div>}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" autoFocus disabled={state.kind === "syncing"} onClick={close}>Cancel</button>
        <button type="button" className="btn btn-primary" data-primary-action disabled={state.kind !== "ready" || selected.length === 0} onClick={() => void sync()}>{state.kind === "syncing" ? "Syncing…" : "Sync"}</button>
      </div>
    </Modal>
  );
}
