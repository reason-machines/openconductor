import { useEffect, useRef, useState, type ReactNode } from "react";
import { AGENT_DEFAULT_MODEL, modelLabel, storedModel } from "./models";
import { CLAUDE_OUTPUT_STYLES, CODEX_PERSONALITIES, levelLabel } from "./agentSettings";
import { withAgentModel } from "./agentSettings";
import type { ClaudePersonality, CodexPersonality, Settings } from "./types";
import { openExternal } from "./agents/api";
import {
  builtIn,
  settingsEffort,
  withReview,
  type BuiltInFavorite,
} from "./agents/loadout";
import { CheckIcon, ChevronDownIcon } from "./agents/icons";
import { LOADOUT_COLUMNS, LOADOUT_LABEL, loadoutModelLabel } from "./reasonPalette";
import { reasonModelName } from "../features/chat/reasonModels";
import { fetchModelCatalog, type CatalogModel } from "./modelCatalog";
import { LoadoutMark, ModelLoadout } from "./ModelLoadout";
import "./agents/agents.css";

interface Props {
  settings: Settings;
  save: (next: Settings) => Promise<boolean> | void;
}

/** Conductor's review model when none is chosen (index `pZ`; features/diff/review.ts). */
const REVIEW_FALLBACK = AGENT_DEFAULT_MODEL.claude;

const loadoutLabel = (model: string) => loadoutModelLabel(model) ?? (model.includes(":") || model.includes("/") || model === "default" ? reasonModelName(model, []) : modelLabel(model));

/**
 * Settings › Default models (Conductor's `models` tab, `$3a`): the Loadout
 * (five model slots, the first the default for new chats, filled from the
 * per-agent palette by click or drag), Codex personality, Claude output
 * style, Review model and Default to plan mode in new chats.
 */
export function DefaultModelsPage({ settings, save }: Props) {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchModelCatalog>>>({ models: [], errors: {} });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setCatalog({ models: [], errors: {} });
    void fetchModelCatalog().then((next) => {
      if (live) { setCatalog(next); setLoading(false); }
    }, (error: unknown) => {
      if (live) { setCatalog({ models: [], errors: { reason: String(error), claude: String(error), codex: String(error) } }); setLoading(false); }
    });
    return () => { live = false; };
  }, [revision, settings.reason?.workspace, settings.reason_executable_path, settings.claude_executable_path, settings.codex_executable_path]);
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
        <ModelLoadout settings={settings} save={save} models={catalog.models} errors={catalog.errors} loading={loading} refresh={() => setRevision((value) => value + 1)} />
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
          models={catalog.models}
          value={review}
          onChange={(f) => save(withReview(settings, f))}
          trigger={(open) => (
            <button type="button" className="ag-picker-trigger" aria-label={`Review model: ${loadoutLabel(review.model)}`} onClick={open}>
              <span className="ag-medium">{loadoutLabel(review.model)}</span>
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

/**
 * Model and effort menu for a slot or the review model. Conductor opens its
 * composer model picker here; this menu lists the same palette models and
 * the chosen model's effort levels.
 */
function ModelPicker({
  models,
  value,
  onChange,
  trigger,
}: {
  models: readonly CatalogModel[];
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
          {LOADOUT_COLUMNS.map((a) => (
            <div key={a} className="ag-menu-group">
              <div className="ag-menu-head">
                <LoadoutMark agent={a} size={12} />
                {LOADOUT_LABEL[a]}
              </div>
              {models.filter((model) => model.agent === a).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value?.agent === a && value.model === model.id}
                  className="ag-menu-item"
                  onClick={() => {
                    onChange(builtIn(value?.id ?? "picked", model.id, value?.agent === a ? value.thinkingLevel : model.defaultEffort ?? undefined, value?.fastMode ?? false, a));
                    setOpen(false);
                  }}
                >
                  <span className="ag-grow ag-truncate">{model.name}</span>
                  {value?.agent === a && value.model === model.id && <CheckIcon size={12} />}
                </button>
              ))}
            </div>
          ))}
          {value && agent && (models.find((model) => model.agent === agent && model.id === value.model)?.efforts?.length ?? 0) > 0 && (
            <div className="ag-menu-group">
              <div className="ag-menu-head">Effort</div>
              <div className="ag-menu-efforts">
                {models.find((model) => model.agent === agent && model.id === value.model)?.efforts?.map((l) => (
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
