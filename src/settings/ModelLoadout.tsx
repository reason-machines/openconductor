import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { AgentKind, Settings } from "./types";
import type { CatalogModel } from "./modelCatalog";
import { listFavorites, replaceFavorites } from "./agents/api";
import { builtIn, clearSlot, equipSlot, loadoutSlots, LOADOUT_SLOTS, moveSlot, parseFavorites, slotsToRows, withLoadoutDefault, type Favorite } from "./agents/loadout";
import { AgentMark, CheckIcon, CloseIcon, ExternalIcon, GripIcon, ReasonMark } from "./agents/icons";
import { LOADOUT_COLUMNS, LOADOUT_LABEL } from "./reasonPalette";
import { levelLabel } from "./agentSettings";

interface Props {
  settings: Settings;
  save: (next: Settings) => Promise<boolean> | void;
  models: readonly CatalogModel[];
  errors: Partial<Record<AgentKind, string>>;
  loading: boolean;
  refresh: () => void;
}

type Source = { kind: "palette"; model: CatalogModel } | { kind: "slot"; index: number };
type Pickup = { source: Source; target: number };
type Menu = { x: number; y: number; source: Source; anchor: HTMLElement };

export function LoadoutMark({ agent, size }: { agent: AgentKind; size: number }) {
  return agent === "reason" ? <ReasonMark size={size} /> : <AgentMark agent={agent} size={size} />;
}

export function ModelLoadout({ settings, save, models, errors, loading, refresh }: Props) {
  const [stored, setStored] = useState<Favorite[] | null>(null);
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slotsRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nativeDrag = useRef<{ source: Source; accepted: boolean; canceled: boolean } | null>(null);
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);
  const pendingWrites = useRef(0);
  const confirmed = useRef<(Favorite | null)[] | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const slots = loadoutSlots(settings, stored ?? []);
  const slotsValue = useRef(slots);
  slotsValue.current = slots;

  useEffect(() => {
    let live = true;
    void listFavorites().then((rows) => {
      if (live) {
        const favorites = parseFavorites(rows);
        confirmed.current = loadoutSlots(settingsRef.current, favorites);
        setStored(favorites);
      }
    }, (e: unknown) => {
      if (live) setError(`Could not read the saved loadout: ${String(e)}`);
    });
    return () => { live = false; };
  }, []);

  const label = (favorite: Favorite) => favorite.type === "built-in"
    ? models.find((model) => model.agent === favorite.agent && model.id === favorite.model)?.name ?? favorite.model
    : favorite.modelId;
  const sourceLabel = (source: Source) => source.kind === "palette" ? source.model.name : slotsValue.current[source.index] ? label(slotsValue.current[source.index]!) : "Model";
  const favorite = (model: CatalogModel) => ({ ...builtIn(crypto.randomUUID(), model.id, undefined, false, model.agent), thinkingLevel: model.defaultEffort ?? undefined });
  const nextFree = () => { const index = slotsValue.current.findIndex((slot) => slot === null); return index < 0 ? 0 : index; };

  const commit = (next: (Favorite | null)[], message: string) => {
    const changedAt = ++revision.current;
    pendingWrites.current += 1;
    slotsValue.current = next;
    setStored(parseFavorites(slotsToRows(next)));
    setNotice(message);
    setError(null);
    setSaving(true);
    const run = writes.current.then(async () => {
      const nextSettings = withLoadoutDefault(settingsRef.current, next);
      await replaceFavorites(slotsToRows(next));
      if (await save(nextSettings) === false) throw new Error("Could not save the default model.");
      confirmed.current = next;
    });
    writes.current = run.catch(async (e: unknown) => {
      const previous = confirmed.current ?? loadoutSlots(settingsRef.current, []);
      let message = String(e);
      try { await replaceFavorites(slotsToRows(previous)); }
      catch { message += " The saved loadout could not be restored. Reopen Settings to read its current state."; }
      if (changedAt === revision.current) {
        slotsValue.current = previous;
        setStored(parseFavorites(slotsToRows(previous)));
        setError(message);
      }
    }).finally(() => { pendingWrites.current -= 1; setSaving(pendingWrites.current > 0); });
  };
  const clear = (index: number) => commit(clearSlot(slotsValue.current, index), `Slot ${index + 1} cleared.`);
  const drop = (source: Source, target: number) => {
    const next = source.kind === "palette"
      ? equipSlot(slotsValue.current, favorite(source.model), target)
      : moveSlot(slotsValue.current, source.index, target);
    commit(next, `${sourceLabel(source)} placed in slot ${target + 1}${target === 0 ? ", the default for new chats" : ""}.`);
    setPickup(null);
    setDropAt(null);
  };

  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (nativeDrag.current) nativeDrag.current.canceled = true;
      if (pickup) { event.preventDefault(); event.stopPropagation(); setPickup(null); setNotice("Move canceled."); }
    };
    const outsideDrop = (event: globalThis.DragEvent) => {
      const drag = nativeDrag.current;
      if (!drag || slotsRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      drag.accepted = true;
      if (drag.source.kind === "slot") clear(drag.source.index);
      setDropAt(null);
    };
    const allowOutside = (event: globalThis.DragEvent) => { if (nativeDrag.current) event.preventDefault(); };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("drop", outsideDrop, true);
    document.addEventListener("dragover", allowOutside);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("drop", outsideDrop, true);
      document.removeEventListener("dragover", allowOutside);
    };
  });

  const startDrag = (event: DragEvent, source: Source) => {
    if (stored === null) { event.preventDefault(); return; }
    setMenu(null);
    setPickup(null);
    nativeDrag.current = { source, accepted: false, canceled: false };
    event.dataTransfer.effectAllowed = source.kind === "slot" ? "move" : "copy";
    event.dataTransfer.setData("text/plain", sourceLabel(source));
  };
  const endDrag = (event: DragEvent) => {
    const drag = nativeDrag.current;
    const bounds = slotsRef.current?.getBoundingClientRect();
    if (drag && bounds && !drag.accepted && !drag.canceled && drag.source.kind === "slot" &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) clear(drag.source.index);
    nativeDrag.current = null;
    setDropAt(null);
  };
  const openMenu = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, source: Source) => {
    event.preventDefault();
    const anchor = event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    setMenu({ source, anchor, x: Math.min(rect.left, window.innerWidth - 248), y: Math.min(rect.bottom + 4, window.innerHeight - 280) });
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, source: Source) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { openMenu(event, source); return; }
    if (pickup && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const target = Math.max(0, Math.min(LOADOUT_SLOTS - 1, pickup.target + delta));
      setPickup({ ...pickup, target });
      cardRefs.current[target]?.focus();
      setNotice(`Slot ${target + 1}. Press Enter to drop, or Escape to cancel.`);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (pickup) drop(pickup.source, pickup.target);
      else {
        const target = source.kind === "slot" ? source.index : nextFree();
        setPickup({ source, target });
        cardRefs.current[target]?.focus();
        setNotice(`${sourceLabel(source)} picked up. Use arrow keys to choose a slot, then Enter to drop.`);
      }
    } else if (!pickup && source.kind === "slot" && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault(); clear(source.index);
    }
  };
  const firstEmpty = slots.findIndex((slot) => slot === null);

  return (
    <div className="ag-loadout" aria-label="Model loadout">
      <div className="ag-loadout-share">
        <button type="button" className="ag-btn ag-outline ag-sm" onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify({ slots: slotsToRows(slots) }, null, 2)).then(() => setNotice("Loadout copied to clipboard."), (e: unknown) => setError(String(e)));
        }}>Share <ExternalIcon size={14} /></button>
      </div>
      <div className="ag-slots" ref={slotsRef} aria-busy={stored === null} aria-label="Loadout slots">
        {slots.map((slot, index) => {
          const source: Source = { kind: "slot", index };
          const targeted = dropAt === index || pickup?.target === index;
          return (
            <div key={index} data-loadout-slot={index + 1} className={`ag-slot-cell${targeted ? " drop" : ""}`}
              onDragOver={(event) => { if (nativeDrag.current) { event.preventDefault(); event.dataTransfer.dropEffect = nativeDrag.current.source.kind === "slot" ? "move" : "copy"; setDropAt(index); } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null); }}
              onDrop={(event) => {
                event.preventDefault();
                const drag = nativeDrag.current;
                if (drag) { drag.accepted = true; drop(drag.source, index); }
              }}>
              <button type="button" ref={(node) => { cardRefs.current[index] = node; }}
                className={slot ? "ag-slot-card" : "ag-slot-empty"}
                draggable={!!slot} disabled={stored === null}
                aria-label={`Slot ${index + 1}${index === 0 ? ", default" : ""}: ${slot ? label(slot) : "Empty"}`}
                aria-pressed={pickup?.source.kind === "slot" && pickup.source.index === index}
                aria-describedby="loadout-keyboard-help"
                onDragStart={(event) => startDrag(event, source)} onDragEnd={endDrag}
                onKeyDown={(event) => { if (slot || pickup) keyDown(event, source); }}
                onClick={(event) => { if (slot && !pickup) openMenu(event, source); }}
                onContextMenu={(event) => { if (slot) openMenu(event, source); }}>
                {slot ? <>
                  <span className="ag-slot-icon">{slot.type === "built-in" && <LoadoutMark agent={slot.agent} size={28} />}</span>
                  <span className="ag-slot-model ag-truncate">{label(slot)}</span>
                  <span className="ag-slot-effort">{slot.type === "built-in" && slot.thinkingLevel ? levelLabel(slot.thinkingLevel) : ""}</span>
                </> : <span className="ag-mono">{targeted || index === firstEmpty ? "DROP MODEL HERE" : "EMPTY"}</span>}
                <span className="ag-slot-num">{index + 1}</span>
                {slot && index === 0 && <span className="ag-default-badge">DEFAULT</span>}
              </button>
              {slot && <button type="button" className="ag-slot-delete" aria-label={`Remove model from slot ${index + 1}`} onClick={() => clear(index)}><CloseIcon size={14} /></button>}
            </div>
          );
        })}
      </div>
      <p id="loadout-keyboard-help" className="ag-sr-only">Press Enter to pick up a model, arrow keys to choose a slot, and Enter to drop. Press Escape to cancel. Right-click for slot actions.</p>
      <span className="ag-sr-only" role="status" aria-live="polite">{notice}{saving ? " Saving." : ""}</span>
      {error && <p role="alert" className="error small">{error}</p>}
      <div className="ag-palette">
        {LOADOUT_COLUMNS.map((agent) => <section key={agent} className="ag-palette-col" aria-label={LOADOUT_LABEL[agent]}>
          <span className="ag-palette-head"><LoadoutMark agent={agent} size={14} />{LOADOUT_LABEL[agent]}</span>
          <div className="ag-palette-list" aria-busy={loading}>
            {models.filter((model) => model.agent === agent).map((model) => {
              const source: Source = { kind: "palette", model };
              return <button key={model.id} type="button" draggable disabled={stored === null} className="ag-palette-item" aria-label={`Add ${model.name} to loadout`} title={model.name}
                aria-describedby="loadout-keyboard-help" onClick={() => drop(source, nextFree())}
                onKeyDown={(event) => keyDown(event, source)} onContextMenu={(event) => openMenu(event, source)}
                onDragStart={(event) => startDrag(event, source)} onDragEnd={endDrag}>
                <span className="ag-truncate">{model.name}</span>
                {slots.some((slot) => slot?.type === "built-in" && slot.agent === agent && slot.model === model.id) && <CheckIcon size={12} />}
                <span className="ag-grip"><GripIcon size={14} /></span>
              </button>;
            })}
            {loading && <span className="ag-muted ag-text-sm">Loading models…</span>}
            {!loading && errors[agent] && <p className="ag-muted ag-text-sm" role="status">{errors[agent]}</p>}
            {!loading && !errors[agent] && !models.some((model) => model.agent === agent) && <p className="ag-muted ag-text-sm">No models available</p>}
          </div>
        </section>)}
      </div>
      <button type="button" className="ag-inline-link ag-catalog-refresh" onClick={refresh} disabled={loading}>Refresh model catalogs</button>
      {menu && <LoadoutMenu menu={menu} close={() => { setMenu(null); menu.anchor.focus(); }}>
        {Array.from({ length: LOADOUT_SLOTS }, (_, index) => <button key={index} type="button" role="menuitem" className="ag-menu-item" onClick={() => { drop(menu.source, index); setMenu(null); cardRefs.current[index]?.focus(); }}>
          {menu.source.kind === "palette" ? "Add to" : "Move to"} slot {index + 1}{index === 0 ? " (default)" : ""}
        </button>)}
        {menu.source.kind === "slot" && <>
          {(() => {
            const slot = slots[menu.source.index];
            if (slot?.type !== "built-in") return null;
            const model = models.find((entry) => entry.agent === slot.agent && entry.id === slot.model);
            return model?.efforts?.map((effort) => <button key={effort} type="button" role="menuitemradio" aria-checked={slot.thinkingLevel === effort} className="ag-menu-item" onClick={() => {
              commit(equipSlot(slots, { ...slot, thinkingLevel: effort }, menu.source.kind === "slot" ? menu.source.index : 0), `Effort set to ${levelLabel(effort)}.`);
              setMenu(null);
            }}>Effort: {levelLabel(effort)}{slot.thinkingLevel === effort && <CheckIcon size={12} />}</button>);
          })()}
          <button type="button" role="menuitem" className="ag-menu-item" onClick={() => { if (menu.source.kind === "slot") clear(menu.source.index); setMenu(null); menu.anchor.focus(); }}>Remove</button>
        </>}
      </LoadoutMenu>}
    </div>
  );
}

function LoadoutMenu({ menu, close, children }: { menu: Menu; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: globalThis.MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return <div ref={ref} className="ag-menu ag-loadout-menu" role="menu" aria-label="Loadout actions" style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => {
    if (event.key === "Escape" || event.key === "Tab") { event.stopPropagation(); close(); }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  }}>{children}</div>;
}
