// The composer's model picker, after Conductor's (renderApp `RNi`/`zHt`, DOM in
// evidence/chat/composer/README.md): a chip "Opus 5 High ⌄" at the composer's
// bottom left opens a menu above it with a search box, the favourite models
// (the chat's current one checked), "Add models", the effort submenu
// ("Effort"/"Thinking"), the Fast toggle, and a footer with "Edit" and the
// Cycle effort shortcut. ⌘/ opens it, ⌘⇧/ cycles the effort, ⌘⇧E toggles Fast.

import { ShortcutHint, Tooltip } from "../../components/ui/Tooltip.tsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePresence } from "../../components/motion/usePresence.ts";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { AGENT_LABEL, agentForModel } from "../../settings/models.ts";
import { effectiveEffort, fastModeAvailable, modelChoiceChip, modelDisplayName, modelEfforts, nextEffort, type ModelChoice } from "./composerModels.ts";
import { ArrowUpRightIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ModelGlyph, PlusSmallIcon, SearchSmallIcon, SettingsSmallIcon } from "./composerIcons.tsx";

import type { ChatAgentId } from "./agentChoice";
import { orderedModelChoices, sameModelChoice, selectLoadoutSlot } from "./loadoutChoices.ts";
import { PRIORITY } from "../../keybindings/dispatcher.ts";

export type { ModelChoice };

export interface ModelPickerProps {
  value: ModelChoice;
  /** Occupied loadout entries, already in physical slot order, listed first. */
  favorites?: readonly ModelChoice[];
  loadout?: readonly (ModelChoice | null)[];
  keybindingDialogIds?: string[];
  /** Label shown instead of the model's display name (an agent without Conductor model ids). */
  label?: string;
  onChange: (next: ModelChoice) => void;
  /** "Add models" and "Edit": open Settings › Default models. */
  onOpenSettings?: () => void;
  /** This local chat exposes Fast, disabled for an unsupported model. */
  fastSupported?: boolean;
  disabled?: boolean;
  /** Extra entries under the favourites (e.g. the agent picker). */
  children?: ReactNode;
  /** Name for a listed entry that is not a Conductor model id (an agent such as Codex). */
  itemLabel?: (choice: ModelChoice) => string | undefined;
  /** Every model the agent offers (Reason's list), listed before the favourites; none: favourites only, at most five entries. */
  models?: readonly ModelChoice[];
  /** The agent's own name for a model id (Reason's "Claude Opus 5.5"), for the chip and the list. */
  modelName?: (model: string) => string | undefined;
  /** A line about a model (Reason's "Claude · Subscription"), shown as its tooltip. */
  modelDescription?: (model: string) => string | undefined;
  itemAgent?: (choice: ModelChoice) => ChatAgentId;
}

const same = sameModelChoice;

export function ModelPicker({ value, favorites = [], loadout = [], keybindingDialogIds, label, onChange, onOpenSettings, fastSupported = false, disabled = false, children, itemLabel, models, modelName, modelDescription, itemAgent }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const menu = usePresence(open);
  const [query, setQuery] = useState("");
  const [searchHeight, setSearchHeight] = useState<number>();
  const searching = query.trim() !== "";
  const [searchIndex, setSearchIndex] = useState(0);
  const [effortOpen, setEffortOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const menuInner = useRef<HTMLDivElement>(null);
  const effortTrigger = useRef<HTMLButtonElement>(null);
  const effortMenu = useRef<HTMLDivElement>(null);
  const focusEffortOnOpen = useRef(false);
  const { overrides } = useKeybindingOverrides();
  const hint = (id: string) => {
    const s = effectiveShortcuts(id, overrides)[0];
    return s ? glyphs(s) : "";
  };
  const nameOf = (f: ModelChoice) => itemLabel?.(f) ?? modelName?.(f.model) ?? modelDisplayName(f.model);
  const chip = modelChoiceChip(value, modelName?.(value.model));
  const efforts = modelEfforts(value.model);
  const modelAgent = agentForModel(value.model);
  const showUnsupportedEffort = !efforts && modelAgent !== null && (itemAgent?.(value) ?? value.agent ?? modelAgent) === modelAgent;
  const current = value.agent ? value.effort : effectiveEffort(value.model, value.effort);
  const showFast = fastSupported && fastModeAvailable(value.model);
  const items = useMemo(() => {
    const list = orderedModelChoices(value, favorites, models);
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/);
    const name = (f: ModelChoice) => itemLabel?.(f) ?? modelName?.(f.model) ?? modelDisplayName(f.model);
    return q ? list.filter((f) => {
      const agent = itemAgent?.(f) ?? f.agent ?? agentForModel(f.model);
      const agentLabel = agent === "reason" ? "Reason" : agent ? AGENT_LABEL[agent] : "";
      const fields = [name(f), f.model, agentLabel, agent ? `${agent}:${f.model}` : ""].map((field) => field.toLowerCase());
      return words.every((word) => fields.some((field) => field.includes(word)));
    }) : list;
  }, [favorites, value, query, itemLabel, models, modelName, itemAgent]);

  useLayoutEffect(() => {
    const rows = root.current?.querySelector(".oc-model-list");
    if (rows) rows.scrollTop = 0;
  }, [query]);

  const changeQuery = (next: string) => {
    if (!next.trim()) setSearchHeight(undefined);
    else if (!query.trim()) setSearchHeight(menuInner.current?.getBoundingClientRect().height);
    setQuery(next);
    setSearchIndex(0);
  };

  const selectSlot = (index: number) => {
    const focused = document.activeElement;
    const composer = root.current?.closest(".composer, .create-card");
    if (disabled || (!open && !composer?.contains(focused))) return false;
    selectLoadoutSlot(loadout, index, onChange);
    return true;
  };
  useKeybindings({
    "chat.selectLoadout1": () => selectSlot(0),
    "chat.selectLoadout2": () => selectSlot(1),
    "chat.selectLoadout3": () => selectSlot(2),
    "chat.selectLoadout4": () => selectSlot(3),
    "chat.selectLoadout5": () => selectSlot(4),
    "chat.openModelPicker": () => (disabled ? false : setOpen((o) => !o)),
    "chat.toggleThinking": () => {
      const next = nextEffort(value.model, value.effort);
      if (disabled || next === null) return false;
      onChange({ ...value, effort: next });
    },
    "chat.toggleFastMode": () => (disabled || !showFast ? false : onChange({ ...value, fast: !value.fast })),
  }, { priority: PRIORITY.HIGH, allowWhileTyping: true, enableOnDialogIds: keybindingDialogIds });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSearchHeight(undefined);
      setSearchIndex(0);
      setEffortOpen(false);
      return;
    }
    const close = (e: MouseEvent) => root.current?.contains(e.target as Node) || setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (effortOpen && focusEffortOnOpen.current) {
      effortMenu.current?.querySelector<HTMLButtonElement>("button")?.focus();
      focusEffortOnOpen.current = false;
    }
  }, [effortOpen]);

  const onEffortTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.defaultPrevented || e.nativeEvent.isComposing || disabled) return;
    if (e.key !== "ArrowRight" && e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (effortOpen) effortMenu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else {
      focusEffortOnOpen.current = true;
      setEffortOpen(true);
    }
  };

  const onEffortOptionKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.defaultPrevented || e.nativeEvent.isComposing || disabled || !efforts) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "ArrowLeft" && e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next = (index + (e.key === "ArrowDown" ? 1 : -1) + efforts.options.length) % efforts.options.length;
      effortMenu.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    } else {
      if (e.key === "Enter") onChange({ ...value, effort: efforts.options[index].value });
      setEffortOpen(false);
      effortTrigger.current?.focus();
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || ("isComposing" in e && e.isComposing === true) || e.nativeEvent.isComposing === true
      || e.keyCode === 229 || e.which === 229 || e.nativeEvent.keyCode === 229 || e.nativeEvent.which === 229) return;
    const resultIndex = e.target instanceof HTMLButtonElement ? e.target.dataset.modelResult : undefined;
    const inSearch = e.target === search.current || (query.trim() !== "" && resultIndex !== undefined);
    if (query.trim() && inSearch && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      e.stopPropagation();
      if (items.length && !disabled) {
        const index = resultIndex === undefined ? 0 : Number(resultIndex);
        const next = (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        root.current?.querySelector<HTMLButtonElement>(`[data-model-result="${next}"]`)?.focus();
      }
      return;
    }
    if (inSearch && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const match = query.trim() ? items[resultIndex === undefined ? 0 : Number(resultIndex)] : undefined;
      if (match && !disabled) {
        if (!same(match, value)) onChange(match);
        changeQuery("");
        search.current?.focus();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (effortOpen) setEffortOpen(false);
      else if (e.target === search.current && query !== "") changeQuery("");
      else setOpen(false);
    } else if (e.target === search.current && e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Tab") {
      e.stopPropagation();
    }
  };

  const fastRow = (
    <button type="button" role="menuitemcheckbox" aria-checked={showFast && !!value.fast} disabled={disabled || !showFast} className="oc-model-row" onClick={() => { if (!disabled && showFast) onChange({ ...value, fast: !value.fast }); }}>
      <span className="oc-model-row-grow">Fast</span>
      {showFast ? <span className="oc-kbd-hint">{hint("chat.toggleFastMode")}</span> : null}
      <span className="oc-switch" data-state={showFast && value.fast ? "checked" : "unchecked"} aria-hidden>
        <span />
      </span>
    </button>
  );
  return (
    <span className="oc-model-picker" ref={root} onKeyDown={onMenuKey}>
      <Tooltip content={<p>Change agent <ShortcutHint commandId="chat.openModelPicker" /></p>}>
        <button
          type="button"
          className="oc-model-chip"
          data-testid="composer-model-button"
          aria-label={`${label ? "Change model" : "Change agent"} (${label ?? chip.accessible})`}
          title={label ?? chip.accessible}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          {/* Conductor's `composer-compact-model-icon`: shown only while the composer is minimized. */}
          <span className="oc-model-chip-icon" aria-hidden>
            <ModelGlyph model={value.model} agent={itemAgent?.(value)} />
          </span>
          <span className="oc-model-chip-label">{label ?? chip.label}</span>
          <span className="oc-model-chip-details">
            {!label && chip.effort ? <span className="oc-model-chip-effort">{chip.effort}</span> : null}
            <ChevronDownIcon className="oc-model-chip-chevron" />
          </span>
        </button>
      </Tooltip>
      {menu.mounted ? (
        <div className="oc-model-menu" role="menu" aria-label="Model" data-motion="popup" {...menu.attrs}>
          <div className="oc-model-menu-inner" ref={menuInner} style={searching ? { height: searchHeight } : undefined}>
            <div className="oc-model-search">
              <SearchSmallIcon />
              <input ref={search} aria-label="Search models" placeholder="Search models" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} autoFocus value={query} onChange={(e) => changeQuery(e.target.value)} />
            </div>
            <div className="oc-model-list">
              {items.length === 0 ? <div className="oc-model-empty">No models found</div> : null}
              {items.map((f, index) => {
                const selected = same(f, value);
                const e = modelChoiceChip(f).effort;
                const agent = searching ? itemAgent?.(f) ?? f.agent ?? agentForModel(f.model) : undefined;
                const detail = searching ? (agent === "reason" ? "Reason" : agent ? AGENT_LABEL[agent] : undefined) : e;
                return (
                  <button
                    key={`${f.agent ?? ""}:${f.model}:${f.effort ?? ""}:${!!f.fast}`}
                    type="button"
                    role="menuitem"
                    className="oc-model-item"
                    data-selected={selected || undefined}
                    data-model-result={index}
                    disabled={disabled}
                    data-highlighted={query.trim() !== "" && index === searchIndex || undefined}
                    onFocus={() => setSearchIndex(index)}
                    title={[nameOf(f), modelDescription?.(f.model)].filter(Boolean).join(" · ")}
                    onClick={() => {
                      if (!selected) onChange(f);
                      if (searching) changeQuery("");
                      else setOpen(false);
                    }}
                  >
                    <ModelGlyph model={f.model} agent={itemAgent?.(f)} />
                    <span className="oc-model-item-name">{selected && label ? label : nameOf(f)}</span>
                    {detail ? <span className="oc-model-item-effort">{detail}</span> : null}
                    {selected ? <CheckIcon className="oc-model-item-check" /> : null}
                  </button>
                );
              })}
              {!searching ? children : null}
              {!searching && onOpenSettings ? (
                <button
                  type="button"
                  role="menuitem"
                  className="oc-model-item oc-model-add"
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                >
                  <span className="oc-model-add-icon">
                    <PlusSmallIcon />
                  </span>
                  <span className="oc-model-item-name">Add models</span>
                  <ArrowUpRightIcon className="oc-model-item-check" />
                </button>
              ) : null}
            </div>
            {!searching && (efforts || fastSupported) ? <div className="oc-model-sep" /> : null}
            {!searching && efforts ? (
              <div className="oc-model-sub" onMouseEnter={() => setEffortOpen(true)} onMouseLeave={() => setEffortOpen(false)}>
                <button ref={effortTrigger} type="button" role="menuitem" className="oc-model-row" aria-haspopup="menu" aria-expanded={effortOpen} data-highlighted={effortOpen || undefined} onKeyDown={onEffortTriggerKey} onClick={() => setEffortOpen(true)}>
                  <span>{efforts.axisLabel}</span>
                  <span className="oc-model-row-value">{efforts.options.find((o) => o.value === current)?.label}</span>
                  <ChevronRightIcon className="oc-model-row-chevron" />
                </button>
                {effortOpen ? (
                  <div ref={effortMenu} className="oc-model-submenu" role="menu" aria-label={efforts.axisLabel}>
                    {efforts.options.map((o, index) => (
                      <button
                        key={o.value}
                        type="button"
                        role="menuitem"
                        className="oc-model-row"
                        data-selected={o.value === current || undefined}
                        onKeyDown={(e) => onEffortOptionKey(e, index)}
                        onClick={() => {
                          onChange({ ...value, effort: o.value });
                          setOpen(false);
                        }}
                      >
                        <span>{o.label}</span>
                        {o.value === current ? <CheckIcon className="oc-model-item-check" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : !searching && showUnsupportedEffort ? (
              <>
                {!fastSupported ? <div className="oc-model-sep" /> : null}
                <Tooltip content="Not supported for this model" side="right">
                  <div className="oc-model-sub">
                    <button type="button" role="menuitem" className="oc-model-row" disabled>
                      <span>Effort</span>
                      <span className="oc-model-row-value">Not supported</span>
                      <ChevronRightIcon className="oc-model-row-chevron" />
                    </button>
                  </div>
                </Tooltip>
              </>
            ) : null}
            {!searching && fastSupported ? (
              showFast ? fastRow : (
                <Tooltip content="Not supported for this model" side="right">
                  <div>{fastRow}</div>
                </Tooltip>
              )
            ) : null}
          </div>
          <div className="oc-model-footer">
            {onOpenSettings ? (
              <button
                type="button"
                className="oc-model-edit"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                <SettingsSmallIcon /> Edit
              </button>
            ) : null}
            {efforts ? (
              <>
                <span className="oc-kbd-box">{hint("chat.toggleThinking")}</span>
                Cycle effort
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}
