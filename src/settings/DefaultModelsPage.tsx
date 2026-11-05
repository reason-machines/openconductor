import { useEffect, useState } from "react";
import { Row } from "./GeneralPage";
import { withField } from "./model";
import { AGENT_LABEL, agentForModel, CLAUDE_ALIASES, MODEL_CATALOG, modelLabel, type ModelAgent } from "./models";
import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_OUTPUT_STYLES,
  CODEX_PERSONALITIES,
  CODEX_THINKING_LEVELS,
  levelLabel,
  visibleModels,
  withAgentModel,
  withVisibleModels,
} from "./agentSettings";
import type { ClaudePersonality, CodexPersonality, EffortLevel, Settings, ThinkingLevel } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › Default models: Conductor's rows (Default model, Codex
 * personality for new chats, Claude output style, Review model, Default to
 * plan mode in new chats). Conductor's Default model is a loadout picker with
 * effort and fast mode per model; here the effort and fast mode of the chosen
 * model sit next to its select. The agent launch reads every row
 * (src-tauri/src/settings/launch.rs; evidence/settings/NOTES.md, "Models and
 * providers").
 */
export function DefaultModelsPage({ settings, save }: Props) {
  const m = settings.models;
  return (
    <div className="settings-rows">
      <Row label="Default model" help="Model for new chats">
        <span className="settings-inline">
          <ModelSelect label="Default model" value={m.default} onChange={(v) => save(withField(settings, "models", "default", v))} />
          <EffortSelect settings={settings} save={save} purpose="default" model={m.default} />
          <FastMode
            label="Fast mode"
            checked={m.default_fast_mode === true}
            onChange={(v) => save({ ...settings, models: { ...m, default_fast_mode: v } })}
          />
        </span>
      </Row>
      <Row label="Codex personality for new chats" help="Style to use when a new chat starts with a Codex model">
        <select
          aria-label="Codex personality for new chats"
          value={m.codex.personality ?? "pragmatic"}
          title={CODEX_PERSONALITIES.find((p) => p.value === (m.codex.personality ?? "pragmatic"))?.description}
          onChange={(e) => save(withAgentModel(settings, "codex", "personality", e.target.value as CodexPersonality))}
        >
          {CODEX_PERSONALITIES.map((p) => (
            <option key={p.value} value={p.value} title={p.description}>
              {p.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Claude output style" help="Choose which output style to apply to new chats. Existing chats do not change.">
        <select
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
      </Row>
      <Row label="Review model">
        <span className="settings-inline">
          <ModelSelect
            label="Review model"
            value={m.review ?? ""}
            sameAsDefault
            onChange={(v) => save(withField(settings, "models", "review", v === "" ? null : v))}
          />
          <EffortSelect settings={settings} save={save} purpose="review" model={m.review ?? m.default} />
          <FastMode
            label="Review fast mode"
            checked={m.review_fast_mode ?? m.default_fast_mode === true}
            onChange={(v) => save({ ...settings, models: { ...m, review_fast_mode: v } })}
          />
        </span>
      </Row>
      <Row label="Default to plan mode in new chats">
        <input
          type="checkbox"
          role="switch"
          aria-label="Default to plan mode in new chats"
          checked={m.default_plan_mode === true}
          onChange={(e) => save({ ...settings, models: { ...m, default_plan_mode: e.target.checked } })}
        />
      </Row>
      <OpencodeModelsRow settings={settings} save={save} />
    </div>
  );
}

function ModelSelect({
  label,
  value,
  sameAsDefault = false,
  onChange,
}: {
  label: string;
  value: string;
  sameAsDefault?: boolean;
  onChange: (v: string) => void;
}) {
  const known = value === "" || agentForModel(value) !== null;
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {sameAsDefault && <option value="">Same as default model</option>}
      {!known && <option value={value}>{value}</option>}
      {(Object.keys(MODEL_CATALOG) as ModelAgent[]).map((agent) => (
        <optgroup key={agent} label={AGENT_LABEL[agent]}>
          {MODEL_CATALOG[agent].map((m) => (
            <option key={m} value={m}>
              {modelLabel(m)}
            </option>
          ))}
          {agent === "claude" &&
            CLAUDE_ALIASES.map((m) => (
              <option key={m} value={m}>
                {`${modelLabel(m)}, latest`}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Claude effort or Codex reasoning effort for the model's agent; Cursor models have none here. */
function EffortSelect({
  settings,
  save,
  purpose,
  model,
}: Props & { purpose: "default" | "review"; model: string }) {
  const agent = agentForModel(model) ?? "claude";
  if (agent === "claude") {
    const field = purpose === "default" ? "default_effort_level" : "review_effort_level";
    const value = settings.models.claude_code?.[field] ?? "";
    return (
      <select
        aria-label={purpose === "default" ? "Default effort" : "Review effort"}
        value={value}
        onChange={(e) => save(withAgentModel(settings, "claude_code", field, e.target.value === "" ? null : (e.target.value as EffortLevel)))}
      >
        <option value="">{purpose === "review" ? "Same as default" : "Claude Code default"}</option>
        {CLAUDE_EFFORT_LEVELS.map((l) => (
          <option key={l} value={l}>
            {levelLabel(l)}
          </option>
        ))}
      </select>
    );
  }
  if (agent === "codex") {
    const field = purpose === "default" ? "default_thinking_level" : "review_thinking_level";
    const levels: readonly ThinkingLevel[] = CODEX_THINKING_LEVELS.includes(settings.models.codex[field])
      ? CODEX_THINKING_LEVELS
      : [...CODEX_THINKING_LEVELS, settings.models.codex[field]];
    return (
      <select
        aria-label={purpose === "default" ? "Default thinking level" : "Review thinking level"}
        value={settings.models.codex[field]}
        onChange={(e) => save(withAgentModel(settings, "codex", field, e.target.value as ThinkingLevel))}
      >
        {levels.map((l) => (
          <option key={l} value={l}>
            {levelLabel(l)}
          </option>
        ))}
      </select>
    );
  }
  return null;
}

function FastMode({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-inline muted small">
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Fast
    </label>
  );
}

/**
 * The OpenCode models listed in model pickers (`models.visible_provider_models`,
 * Conductor's "Configure" on the OpenCode provider). Comma-separated ids,
 * saved on Enter or blur.
 */
function OpencodeModelsRow({ settings, save }: Props) {
  const shown = visibleModels(settings).opencode.join(", ");
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const ids = text.split(",");
    const next = withVisibleModels(settings, "opencode", ids);
    if (next.models.visible_provider_models !== (settings.models.visible_provider_models ?? null)) save(next);
  };
  return (
    <Row label="OpenCode models" help="Models from your OpenCode providers to show in model pickers, as provider/model, comma-separated.">
      <input
        type="text"
        aria-label="OpenCode models"
        className="settings-text"
        placeholder="anthropic/claude-sonnet-4-5"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </Row>
  );
}
