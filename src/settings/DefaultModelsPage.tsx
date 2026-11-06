import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AGENT_DEFAULT_MODEL, AGENT_LABEL, MODEL_PALETTE, modelLabel, storedModel, type ModelAgent } from "./models";
import { CLAUDE_OUTPUT_STYLES, CODEX_PERSONALITIES, levelLabel } from "./agentSettings";
import { withAgentModel } from "./agentSettings";
import type { ClaudePersonality, CodexPersonality, Settings } from "./types";
import { listFavorites, openExternal, replaceFavorites } from "./agents/api";
import {
  builtIn,
  displayedLoadout,
  EFFORT_LEVELS,
  equip,
  isEquipped,
  LOADOUT_SLOTS,
  move,
  parseFavorites,
  remove,
  settingsEffort,
  toRows,
  withDefault,
  withReview,
  type BuiltInFavorite,
  type Favorite,
} from "./agents/loadout";
import { AgentMark, CheckIcon, ChevronDownIcon, CloseIcon, ExternalIcon, GripIcon } from "./agents/icons";
import "./agents/agents.css";

interface Props {
  settings: Settings;
  save: (next: Settings) => Promise<boolean> | void;
}

/** Conductor's review model when none is chosen (index `pZ`; features/diff/review.ts). */
const REVIEW_FALLBACK = AGENT_DEFAULT_MODEL.claude;

/** The palette columns, in Conductor's order (`P3a`) without its Cursor and OpenCode columns. */
const COLUMNS = Object.keys(MODEL_PALETTE) as ModelAgent[];

/**
 * Settings › Default models (Conductor's `models` tab, `$3a`): the Loadout
 * (five model slots, the first the default for new chats, filled from the
 * per-agent palette by click or drag), Codex personality, Claude output
 * style, Review model and Default to plan mode in new chats.
 */
export function DefaultModelsPage({ settings, save }: Props) {
  const m = settings.models;
  const personality = m.codex.personality ?? "pragmatic";
  const reviewModel = storedModel(m.review || REVIEW_FALLBACK);
  const review = builtIn("review", reviewModel, settingsEffort(settings, reviewModel, "review"), m.review_fast_mode ?? m.default_fast_mode === true);
  return (
    <div className="oc-ag ag-page">
      <section className="ag-row-block ag-first" aria-label="Loadout">
        <div>
          <div className="ag-setting-title">Loadout</div>
          <p className="ag-setting-desc">Choose which models you want to use</p>
        </div>
        <Loadout settings={settings} save={save} />
      </section>
      <SettingRow title="Codex personality">
        <select
          className="ag-select"
          aria-label="Codex personality"
          value={personality}
          onChange={(e) => save(withAgentModel(settings, "codex", "personality", e.target.value as CodexPersonality))}
        >
          {CODEX_PERSONALITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow
        title="Claude output style"
        description={
          <>
            Choose which{" "}
            <button type="button" className="ag-inline-link" onClick={() => void openExternal("https://code.claude.com/docs/en/output-styles")}>
              output style
            </button>{" "}
            to apply to new chats. Existing chats do not change.
          </>
        }
      >
        <select
          className="ag-select"
          aria-label="Claude output style"
          value={m.claude_code?.personality ?? "default"}
          onChange={(e) => save(withAgentModel(settings, "claude_code", "personality", e.target.value as ClaudePersonality))}
        >
          {CLAUDE_OUTPUT_STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow title="Review model">
        <ModelPicker
          value={review}
          onChange={(f) => save(withReview(settings, f))}
          trigger={(open) => (
            <button type="button" className="ag-picker-trigger" aria-label={`Review model: ${modelLabel(review.model)}`} onClick={open}>
              <span className="ag-medium">{modelLabel(review.model)}</span>
              {review.thinkingLevel && <span className="ag-muted">{levelLabel(review.thinkingLevel)}</span>}
              <ChevronDownIcon size={12} />
            </button>
          )}
        />
      </SettingRow>
      <SettingRow title="Default to plan mode in new chats">
        <Switch
          label="Default to plan mode in new chats"
          checked={m.default_plan_mode === true}
          onChange={(v) => save({ ...settings, models: { ...m, default_plan_mode: v } })}
        />
      </SettingRow>
    </div>
  );
}

function SettingRow({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="ag-row-block">
      <div className="ag-row-main">
        <div className="ag-row-text">
          <div className="ag-setting-title">{title}</div>
          {description && <p className="ag-setting-desc">{description}</p>}
        </div>
        <div className="ag-row-control">{children}</div>
      </div>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`ag-switch${checked ? " on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

type Drag = { kind: "palette"; model: string } | { kind: "slot"; index: number };

/** The five slots and the per-agent palette below them. */
function Loadout({ settings, save }: Props) {
  const [stored, setStored] = useState<Favorite[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  useEffect(() => {
    listFavorites().then((rows) => setStored(parseFavorites(rows)), () => setStored([]));
  }, []);
  const slots = displayedLoadout(settings, stored ?? []);

  const commit = (next: Favorite[]) => {
    setStored(next);
    void replaceFavorites(toRows(next));
    if (next[0] && next[0] !== slots[0]) save(withDefault(settings, next[0]));
  };
  const add = (model: string, index = Math.min(slots.length, LOADOUT_SLOTS - 1)) =>
    commit(equip(slots, builtIn(crypto.randomUUID(), model, undefined, false), index));

  const onDrop = (index: number) => (e: DragEvent) => {
    e.preventDefault();
    const d = drag;
    setDrag(null);
    setDropAt(null);
    if (!d) return;
    if (d.kind === "palette") {
      if (index <= slots.length) add(d.model, index);
    } else if (index !== d.index && index < slots.length) commit(move(slots, d.index, index));
  };
  const dragOver = (index: number) => (e: DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    setDropAt(index);
  };

  return (
    <div className="ag-loadout">
      <div className="ag-loadout-share">
        <button type="button" className="ag-btn ag-outline ag-sm" disabled title="Sign in to share a loadout">
          Share
          <ExternalIcon size={14} />
        </button>
      </div>
      <div className="ag-slots" aria-busy={stored === null}>
        {Array.from({ length: LOADOUT_SLOTS }, (_, i) => {
          const fav = slots[i];
          return (
            <div
              key={i}
              data-loadout-slot
              className={`ag-slot-cell${dropAt === i ? " drop" : ""}`}
              onDragOver={dragOver(i)}
              onDragLeave={() => setDropAt(null)}
              onDrop={onDrop(i)}
            >
              {fav ? (
                <SlotCard
                  fav={fav}
                  index={i}
                  onChange={(f) => commit(slots.map((s, j) => (j === i ? { ...f, id: s.id } : s)))}
                  onDelete={i === 0 ? undefined : () => commit(remove(slots, fav.id))}
                  onDragStart={() => setDrag({ kind: "slot", index: i })}
                  onDragEnd={() => {
                    setDrag(null);
                    setDropAt(null);
                  }}
                />
              ) : (
                <div className="ag-slot-empty">
                  <span className="ag-mono">{i === slots.length ? "DROP MODEL HERE" : "EMPTY"}</span>
                  <span className="ag-slot-num">{i + 1}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="ag-palette">
        {COLUMNS.map((agent) => {
          const label = AGENT_LABEL[agent];
          return (
            <section key={agent} className="ag-palette-col" aria-label={label}>
              <span className="ag-palette-head">
                <AgentMark agent={agent} size={14} />
                {label}
              </span>
              <div className="ag-palette-list">
                {MODEL_PALETTE[agent].map((model) => {
                    const name = modelLabel(model);
                    return (
                      <button
                        key={model}
                        type="button"
                        draggable
                        className="ag-palette-item"
                        aria-label={`Add ${name} to loadout`}
                        title={name}
                        onClick={() => add(model)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "copy";
                          e.dataTransfer.setData("text/plain", model);
                          setDrag({ kind: "palette", model });
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setDropAt(null);
                        }}
                      >
                        <span className="ag-truncate">{name}</span>
                        {isEquipped(slots, model) && <CheckIcon size={12} />}
                        <span className="ag-grip">
                          <GripIcon size={14} />
                        </span>
                      </button>
                    );
                  })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** A filled slot (Conductor's `t3a`): agent icon, model, effort, slot number; DEFAULT on slot 1, × on the others. */
function SlotCard(props: {
  fav: Favorite;
  index: number;
  onChange: (f: BuiltInFavorite) => void;
  onDelete?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { fav, index, onChange, onDelete, onDragStart, onDragEnd } = props;
  const name = fav.type === "built-in" ? modelLabel(fav.model) : fav.modelId;
  const effort = fav.type === "built-in" && fav.thinkingLevel ? levelLabel(fav.thinkingLevel) : undefined;
  return (
    <div
      className="ag-slot"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <ModelPicker
        value={fav.type === "built-in" ? fav : undefined}
        onChange={onChange}
        trigger={(open) => (
          <button type="button" className="ag-slot-card" aria-label={[name, effort].filter(Boolean).join(", ")} title="Change agent" onClick={open}>
            <span className="ag-slot-icon">
              {fav.type === "built-in" && <AgentMark agent={fav.agent} size={28} />}
            </span>
            <span className="ag-slot-model ag-truncate">{name}</span>
            <span className="ag-slot-effort">{effort}</span>
            <span className="ag-slot-num">{index + 1}</span>
          </button>
        )}
      />
      {index === 0 && <span className="ag-default-badge">DEFAULT</span>}
      {onDelete && (
        <button type="button" className="ag-slot-delete" aria-label={`Delete loadout ${index + 1}`} onClick={onDelete}>
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Model and effort menu for a slot or the review model. Conductor opens its
 * composer model picker here; this menu lists the same palette models and
 * the chosen model's effort levels.
 */
function ModelPicker({
  value,
  onChange,
  trigger,
}: {
  value?: BuiltInFavorite;
  onChange: (f: BuiltInFavorite) => void;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const agent = value?.agent;
  return (
    <div className="ag-picker" ref={ref}>
      {trigger(() => setOpen(!open))}
      {open && (
        <div className="ag-menu" role="menu">
          {(Object.keys(MODEL_PALETTE) as ModelAgent[]).map((a) => (
            <div key={a} className="ag-menu-group">
              <div className="ag-menu-head">
                <AgentMark agent={a} size={12} />
                {AGENT_LABEL[a]}
              </div>
              {MODEL_PALETTE[a].map((model) => (
                <button
                  key={model}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value?.model === model}
                  className="ag-menu-item"
                  onClick={() => {
                    onChange(builtIn(value?.id ?? "picked", model, value?.agent === a ? value.thinkingLevel : undefined, value?.fastMode ?? false));
                    setOpen(false);
                  }}
                >
                  <span className="ag-grow ag-truncate">{modelLabel(model)}</span>
                  {value?.model === model && <CheckIcon size={12} />}
                </button>
              ))}
            </div>
          ))}
          {value && agent && EFFORT_LEVELS[agent].length > 0 && (
            <div className="ag-menu-group">
              <div className="ag-menu-head">Effort</div>
              <div className="ag-menu-efforts">
                {EFFORT_LEVELS[agent].map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="menuitemradio"
                    aria-checked={value.thinkingLevel === l}
                    className={`ag-effort${value.thinkingLevel === l ? " on" : ""}`}
                    onClick={() => onChange({ ...value, thinkingLevel: l })}
                  >
                    {levelLabel(l)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
