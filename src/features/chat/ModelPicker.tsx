// The composer's model picker, after Conductor's (renderApp `RNi`/`zHt`, DOM in
// evidence/chat/composer/README.md): a chip "Opus 5 High ⌄" at the composer's
// bottom left opens a menu above it with a search box, the favourite models
// (the chat's current one checked), "Add models", the effort submenu
// ("Effort"/"Thinking"), the Fast toggle, and a footer with "Edit" and the
// Cycle effort shortcut. ⌘/ opens it, ⌘⇧/ cycles the effort, ⌘⇧E toggles Fast.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { effectiveEffort, fastModeAvailable, modelChip, modelDisplayName, modelEfforts, nextEffort, type ModelChoice } from "./composerModels.ts";
import { ArrowUpRightIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ModelGlyph, PlusSmallIcon, SearchSmallIcon, SettingsSmallIcon } from "./composerIcons.tsx";

export type { ModelChoice };

export interface ModelPickerProps {
  value: ModelChoice;
  /** Models listed above "Add models" (Conductor's favourites); the current one is added first when missing. */
  favorites?: readonly ModelChoice[];
  /** Label shown instead of the model's display name (an agent without Conductor model ids). */
  label?: string;
  onChange: (next: ModelChoice) => void;
  /** "Add models" and "Edit": open Settings › Default models. */
  onOpenSettings?: () => void;
  /** Fast mode can be switched for this chat. */
  fastSupported?: boolean;
  disabled?: boolean;
  /** Extra entries under the favourites (e.g. the agent picker). */
  children?: ReactNode;
  /** Name for a listed entry that is not a Conductor model id (an agent such as Codex). */
  itemLabel?: (choice: ModelChoice) => string | undefined;
}

const same = (a: ModelChoice, b: ModelChoice) => a.model === b.model;

export function ModelPicker({ value, favorites = [], label, onChange, onOpenSettings, fastSupported = false, disabled = false, children, itemLabel }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [effortOpen, setEffortOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const { overrides } = useKeybindingOverrides();
  const hint = (id: string) => {
    const s = effectiveShortcuts(id, overrides)[0];
    return s ? glyphs(s) : "";
  };
  const chip = modelChip(value.model, value.effort, value.fast);
  const efforts = modelEfforts(value.model);
  const current = effectiveEffort(value.model, value.effort);
  const showFast = fastSupported && fastModeAvailable(value.model);
  const items = useMemo(() => {
    const list = [value, ...favorites.filter((f) => !same(f, value))].slice(0, 5);
    const q = query.trim().toLowerCase();
    const name = (f: ModelChoice) => itemLabel?.(f) ?? modelDisplayName(f.model);
    return q ? list.filter((f) => name(f).toLowerCase().includes(q) || f.model.includes(q)) : list;
  }, [favorites, value, query, itemLabel]);

  useKeybindings({
    "chat.openModelPicker": () => (disabled ? false : setOpen((o) => !o)),
    "chat.toggleThinking": () => {
      const next = nextEffort(value.model, value.effort);
      if (disabled || next === null) return false;
      onChange({ ...value, effort: next });
    },
    "chat.toggleFastMode": () => (disabled || !showFast ? false : onChange({ ...value, fast: !value.fast })),
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setEffortOpen(false);
      return;
    }
    const close = (e: MouseEvent) => root.current?.contains(e.target as Node) || setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (effortOpen) setEffortOpen(false);
      else setOpen(false);
    }
  };

  return (
    <span className="oc-model-picker" ref={root} onKeyDown={onMenuKey}>
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
        <span className="oc-model-chip-label">{label ?? chip.label}</span>
        <span className="oc-model-chip-details">
          {!label && chip.effort ? <span className="oc-model-chip-effort">{chip.effort}</span> : null}
          <ChevronDownIcon className="oc-model-chip-chevron" />
        </span>
      </button>
      {open ? (
        <div className="oc-model-menu" role="menu" aria-label="Model">
          <div className="oc-model-menu-inner">
            <div className="oc-model-search">
              <SearchSmallIcon />
              <input aria-label="Search models" placeholder="Search models" autoComplete="off" spellCheck={false} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="oc-model-list">
              {items.length === 0 ? <div className="oc-model-empty">No models found</div> : null}
              {items.map((f) => {
                const selected = same(f, value);
                const e = modelChip(f.model, f.effort).effort;
                return (
                  <button
                    key={f.model}
                    type="button"
                    role="menuitem"
                    className="oc-model-item"
                    data-selected={selected || undefined}
                    title={itemLabel?.(f) ?? modelDisplayName(f.model)}
                    onClick={() => {
                      if (!selected) onChange(f);
                      setOpen(false);
                    }}
                  >
                    <ModelGlyph model={f.model} />
                    <span className="oc-model-item-name">{selected && label ? label : (itemLabel?.(f) ?? modelDisplayName(f.model))}</span>
                    {e ? <span className="oc-model-item-effort">{e}</span> : null}
                    {selected ? <CheckIcon className="oc-model-item-check" /> : null}
                  </button>
                );
              })}
              {children}
              {onOpenSettings ? (
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
            {efforts || showFast ? <div className="oc-model-sep" /> : null}
            {efforts ? (
              <div className="oc-model-sub" onMouseEnter={() => setEffortOpen(true)} onMouseLeave={() => setEffortOpen(false)}>
                <button type="button" role="menuitem" className="oc-model-row" aria-haspopup="menu" aria-expanded={effortOpen} data-highlighted={effortOpen || undefined} onClick={() => setEffortOpen(true)}>
                  <span>{efforts.axisLabel}</span>
                  <span className="oc-model-row-value">{efforts.options.find((o) => o.value === current)?.label}</span>
                  <ChevronRightIcon className="oc-model-row-chevron" />
                </button>
                {effortOpen ? (
                  <div className="oc-model-submenu" role="menu" aria-label={efforts.axisLabel}>
                    {efforts.options.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="menuitem"
                        className="oc-model-row"
                        data-selected={o.value === current || undefined}
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
            ) : null}
            {showFast ? (
              <button type="button" role="menuitemcheckbox" aria-checked={!!value.fast} className="oc-model-row" onClick={() => onChange({ ...value, fast: !value.fast })}>
                <span className="oc-model-row-grow">Fast</span>
                <span className="oc-kbd-hint">{hint("chat.toggleFastMode")}</span>
                <span className="oc-switch" data-state={value.fast ? "checked" : "unchecked"} aria-hidden>
                  <span />
                </span>
              </button>
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
