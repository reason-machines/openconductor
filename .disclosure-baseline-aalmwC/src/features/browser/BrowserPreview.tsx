import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { openUrl } from "../../backend";
import { browserAddress, editedPreviewUrl, type BrowserPage } from "./model.ts";
import { browserSnapshot, openBrowserPreview, parkBrowserPreview, placeBrowserPreview, subscribeBrowser } from "./store.ts";
import "./browserPreview.css";

export function BrowserPreviewAnchor({ workspaceId, url }: { workspaceId: string; url: string }) {
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = node.current;
    if (!anchor) return;
    const owner = Symbol("browser-anchor");
    const measure = () => {
      const { left, top, width, height } = anchor.getBoundingClientRect();
      if (width > 0 && height > 0) placeBrowserPreview({ owner, workspaceId, url, rect: { left, top, width, height } });
      else parkBrowserPreview(owner);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(anchor);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      parkBrowserPreview(owner);
    };
  }, [workspaceId, url]);
  return <div className="oc-browser-anchor" ref={node} aria-label="Browser preview area" />;
}

function PreviewFrame({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="oc-browser-failure" role="status">
      <p>Preview not available. Try reloading or open this page in your browser.</p>
    </div>
  ) : (
    <iframe src={url} title={url} sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

export function BrowserPreview({ page, visible }: { page: BrowserPage; visible: boolean }) {
  const address = browserAddress(page.url);
  const [edit, setEdit] = useState(address.rest);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => { setEdit(address.rest); setError(null); }, [address.rest]);
  useLayoutEffect(() => {
    if (!visible && container.current?.contains(document.activeElement)) container.current.focus({ preventScroll: true });
  }, [visible]);
  const navigate = () => {
    const url = editedPreviewUrl(page.url, edit);
    if (!url) { setError("Enter a valid port and path on this host."); return; }
    setError(openBrowserPreview(page.workspaceId, url, false) ? null : "This address cannot be embedded. Open it in your browser.");
  };
  const external = () => {
    void openUrl(page.url).catch(() => setError("Could not open the external browser. Try again."));
  };
  return (
    <div className="oc-browser-preview" ref={container} tabIndex={-1}>
      <div className="oc-browser-toolbar">
        <button type="button" className="rp-icon" aria-label="Reload" title="Reload" onClick={() => openBrowserPreview(page.workspaceId, page.url)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5" /></svg>
        </button>
        <label className="oc-browser-address">
          <span title={address.locked}>{address.locked}</span>
          <input aria-label="Port and path" spellCheck={false} value={edit} onChange={(event) => setEdit(event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); navigate(); event.currentTarget.blur(); }
          }} />
        </label>
        <button type="button" className="rp-icon" aria-label="Open in browser" title="Open in browser" onClick={external}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7" /></svg>
        </button>
      </div>
      {error && <p className="oc-browser-error" role="alert">{error}</p>}
      <PreviewFrame key={`${page.url}:${page.reload}`} url={page.url} />
    </div>
  );
}

function PreviewSurface({ page, placement }: { page: BrowserPage; placement: ReturnType<typeof browserSnapshot>["placement"] }) {
  const visible = placement?.workspaceId === page.workspaceId && placement.url === page.url;
  const rect = useRef({ left: -20000, top: -20000, width: 1, height: 1 });
  if (visible && placement) rect.current = placement.rect;
  return (
    <div className="oc-browser-surface" aria-hidden={!visible} style={{
      position: "fixed", left: visible ? rect.current.left : -20000, top: visible ? rect.current.top : -20000,
      width: rect.current.width, height: rect.current.height, visibility: visible ? "visible" : "hidden", pointerEvents: visible ? "auto" : "none",
    }}>
      <BrowserPreview page={page} visible={visible} />
    </div>
  );
}

export function BrowserPreviewTab({ page, selected, onSelect, onClose }: { page: BrowserPage; selected: boolean; onSelect: () => void; onClose: () => void }) {
  return (
    <span className={`main-tab${selected ? " active" : ""}`}>
      <button type="button" role="tab" aria-selected={selected} className={selected ? "active" : ""} onClick={onSelect} title={page.url}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18" /></svg>{" "}{new URL(page.url).host}
      </button>
      <button type="button" className="main-tab-close" aria-label="Close browser view" onClick={onClose}>×</button>
    </span>
  );
}

export function BrowserPreviewHost() {
  const state = useSyncExternalStore(subscribeBrowser, browserSnapshot);
  return <>{Array.from(state.pages.values()).map((page) => <PreviewSurface key={`${page.workspaceId}:${page.url}`} page={page} placement={state.placement} />)}</>;
}
