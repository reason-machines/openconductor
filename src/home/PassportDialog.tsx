import { useEffect, useRef, useState, type Dispatch } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { appInfo } from "../backend";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import { TicketsPlaneIcon } from "../components/Icons";
import { ConductorIcon } from "../components/ConductorIcon";
import { Tooltip } from "../components/Tooltip";
import { CITY_TOTAL } from "./cities";
import { listArchivedWorkspaces, type ArchivedWorkspace } from "../workspace/archive";
import { PASSPORT_CITIES, type CityTier } from "./passportCities";
import { PASSPORT_COUNTRIES, PASSPORT_GRATICULE } from "./passportWorld";
import { INITIAL_PASSPORT_VIEW, movePassport, passportSelection, passportVisited, passportWorkspaces, projectCity, zoomPassport, type PassportWorkspace } from "./passport";
import "./passport.css";
import "../theme/passport.css";

type TierIcon = "castle" | "landmark" | "building-2";
const TIER_ICONS: Record<Exclude<CityTier, "common">, TierIcon> = { legendary: "castle", rare: "landmark", uncommon: "building-2" };
function PassportIcon({ name }: { name: TierIcon | "minus" | "reset" }) {
  if (name === "building-2") return <ConductorIcon name={name} size={12} strokeWidth={1} />;
  const paths = name === "castle" ? ["M10 5V3", "M14 5V3", "M15 21v-3a3 3 0 0 0-6 0v3", "M18 3v8", "M18 5H6", "M22 11H2", "M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9", "M6 3v8"]
    : name === "landmark" ? ["M10 18v-7", "M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z", "M14 18v-7", "M18 18v-7", "M3 22h18", "M6 18v-7"]
    : name === "minus" ? ["M5 12h14"] : ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"];
  return <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths.map((d) => <path key={d} d={d} />)}</svg>;
}

function PassportMap({ workspaces, onSelect }: { workspaces: readonly PassportWorkspace[]; onSelect: (selection: NonNullable<ReturnType<typeof passportSelection>>) => void }) {
  const [view, setView] = useState(INITIAL_PASSPORT_VIEW);
  const map = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const visited = passportVisited(workspaces);
  useEffect(() => {
    const node = map.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const scale = Math.min(rect.width / 800, rect.height / 600);
      const offsetX = (rect.width - 800 * scale) / 2;
      const offsetY = (rect.height - 600 * scale) / 2;
      const anchor: readonly [number, number] = [(event.clientX - rect.left - offsetX) / scale, (event.clientY - rect.top - offsetY) / scale];
      setView((previous) => zoomPassport(previous, 2 ** (-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002) * (event.ctrlKey ? 10 : 1)), anchor));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  return <>
    <svg ref={map} className="passport-map" viewBox="0 0 800 600" aria-label="Workspace world map" onDoubleClick={(event) => { event.preventDefault(); setView((previous) => zoomPassport(previous, 2)); }}
      onPointerDown={(event) => { if (event.button !== 0) return; suppressClick.current = false; drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false }; }}
      onPointerMove={(event) => {
        const previous = drag.current;
        if (!previous || previous.pointer !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const scale = Math.min(rect.width / 800, rect.height / 600);
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        previous.moved ||= Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 2;
        if (!previous.moved) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setView((current) => movePassport(current, dx / scale, dy / scale));
        previous.x = event.clientX; previous.y = event.clientY;
      }}
      onPointerUp={(event) => { suppressClick.current = drag.current?.moved ?? false; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}>
      <g data-passport-viewport data-zoom={view.zoom} transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        <path className="passport-graticule" d={PASSPORT_GRATICULE} fill="none" />
        <g className="passport-countries">{PASSPORT_COUNTRIES.map((d, i) => <path key={i} d={d} />)}</g>
        {PASSPORT_CITIES.filter((city) => !visited.cities.has(city.slug)).map((city) => {
          const [cx, cy] = projectCity(city.coordinates);
          return <Tooltip key={city.slug} content={<span className="passport-tip">{city.slug.toUpperCase()} {city.tier !== "common" && <span className="passport-tier" data-tier={city.tier}><PassportIcon name={TIER_ICONS[city.tier]} />{city.tier}</span>} <span>[NOT VISITED]</span></span>}>
            <circle cx={cx} cy={cy} r={city.tier === "common" ? 2 : 3} className="passport-unvisited passport-tier" data-tier={city.tier} aria-label={`${city.name}, not visited`} tabIndex={0} />
          </Tooltip>;
        })}
        {workspaces.map((workspace) => {
          const [cx, cy] = projectCity(workspace.city.coordinates);
          const select = () => {
            if (suppressClick.current) return;
            const selection = passportSelection(workspace);
            if (selection) onSelect(selection);
          };
          return <Tooltip key={workspace.selection.workspaceId} content={<span className="passport-tip">{workspace.name.toUpperCase()} {workspace.city.tier !== "common" && <span className="passport-tier" data-tier={workspace.city.tier}><PassportIcon name={TIER_ICONS[workspace.city.tier]} />{workspace.city.tier}</span>} <span>{workspace.archived ? "[ARCHIVED]" : "[CLICK TO OPEN]"}</span></span>}>
            <g role={workspace.archived ? undefined : "button"} tabIndex={0} aria-label={`${workspace.name}${workspace.archived ? ", archived" : ", open workspace"}`} className="passport-workspace passport-tier" data-tier={workspace.city.tier} data-archived={workspace.archived || undefined} onClick={select} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); suppressClick.current = false; select(); } }}>
              <circle cx={cx} cy={cy} r={workspace.archived ? 2 : workspace.city.tier === "common" ? 3 : 4} />
            </g>
          </Tooltip>;
        })}
      </g>
    </svg>
    <div className="passport-zoom">
      <button type="button" aria-label="Zoom in" onClick={() => setView((previous) => zoomPassport(previous, 1.5))}><ConductorIcon name="plus" size={16} strokeWidth={1} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => setView((previous) => zoomPassport(previous, 1 / 1.5))}><PassportIcon name="minus" /></button>
      <button type="button" aria-label="Reset map" onClick={() => setView(INITIAL_PASSPORT_VIEW)}><PassportIcon name="reset" /></button>
    </div>
  </>;
}

function PassportContent({ workspaces, close, dispatch }: { workspaces: readonly PassportWorkspace[]; close: () => void; dispatch: Dispatch<Action> }) {
  const visited = passportVisited(workspaces);
  const [version, setVersion] = useState("...");
  useEffect(() => { let mounted = true; void appInfo().then((info) => { if (mounted) setVersion(info.version); }).catch(() => {}); return () => { mounted = false; }; }, []);
  return <>
    <div className="passport-header" data-tauri-drag-region>
      <div className="passport-heading"><Dialog.Close className="passport-back"><ConductorIcon name="arrow-left" size={16} strokeWidth={1} /><span>BACK TO APP</span></Dialog.Close><Dialog.Title>OpenConductor Passport</Dialog.Title></div>
      <div className="passport-summary"><div className="passport-tiers">{(["legendary", "rare", "uncommon"] as const).map((tier) => <Tooltip key={tier} content={`${tier[0].toUpperCase()}${tier.slice(1)} cities visited`}><span className="passport-tier" data-tier={tier} data-empty={visited.tiers[tier].size === 0 || undefined}><PassportIcon name={TIER_ICONS[tier]} />{visited.tiers[tier].size}</span></Tooltip>)}</div>
        <div className="passport-progress"><span>CITIES VISITED</span><span>[{Array.from({ length: 10 }, (_, index) => <span key={index} data-filled={visited.cities.size / CITY_TOTAL >= (index + 1) / 10 || undefined}>{visited.cities.size / CITY_TOTAL >= (index + 1) / 10 ? "█" : "░"}</span>)}]</span><span>{visited.cities.size}/{CITY_TOTAL}</span></div>
      </div>
    </div>
    <div className="passport-body"><PassportMap workspaces={workspaces} onSelect={(selection) => { close(); dispatch({ type: "select", selection }); }} /></div>
    <div className="passport-footer"><span>SYS::OPENCONDUCTOR v{version}</span><span>GRID::EQUALEARTH</span></div>
  </>;
}

export function PassportButton({ repos, dispatch }: { repos: Repo[]; dispatch: Dispatch<Action> }) {
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const [archived, setArchived] = useState<ArchivedWorkspace[]>([]);
  useEffect(() => { let live = true; void listArchivedWorkspaces().then((rows) => { if (live) setArchived(rows); }).catch(() => {}); return () => { live = false; }; }, [repos]);
  const workspaces = passportWorkspaces(repos, archived);
  const visited = passportVisited(workspaces);
  if (visited.cities.size === 0) return null;
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Tooltip content="View workspace world map"><Dialog.Trigger className="home-cities"><TicketsPlaneIcon size={16} strokeWidth={1} />{visited.cities.size}/{CITY_TOTAL} cities visited</Dialog.Trigger></Tooltip>
    <Dialog.Portal><Dialog.Popup ref={popup} initialFocus={popup} className="passport" data-dialog-id="passport" aria-describedby={undefined}><PassportContent workspaces={workspaces} dispatch={dispatch} close={() => setOpen(false)} /></Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
