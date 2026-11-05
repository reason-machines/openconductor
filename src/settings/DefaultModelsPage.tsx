import { Row } from "./GeneralPage";
import { withField } from "./model";
import { AGENT_DEFAULT_MODEL, AGENT_LABEL, agentForModel, CLAUDE_ALIASES, MODEL_CATALOG, modelLabel, type ModelAgent } from "./models";
import { CLAUDE_EFFORT_LEVELS, type ClaudeEffortLevel, type Settings } from "./types";

/** Conductor's review model when none is chosen: its Claude default, not the chat default (features/diff/review.ts). */
const REVIEW_FALLBACK = AGENT_DEFAULT_MODEL.claude;

function ModelOptions() {
  return (
    <>
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
    </>
  );
}

/** Settings with `models.claude_code.review_effort_level` set, or removed when `level` is empty (TOML has no null). */
function withReviewEffort(settings: Settings, level: ClaudeEffortLevel | ""): Settings {
  const { review_effort_level: _old, ...rest } = settings.models.claude_code ?? {};
  const claude_code = level ? { ...rest, review_effort_level: level } : rest;
  return withField(settings, "models", "claude_code", Object.keys(claude_code).length ? claude_code : undefined);
}

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › Default models. Conductor's tab also has Codex personality,
 * Claude output style and Default to plan mode, and its model rows are
 * loadout pickers with effort per model. Shown here: the default model (read
 * by the new-workspace dialog) and the review model with its Claude effort
 * (read by the Review button, evidence/pr/ai-review.md); the Codex review
 * effort is `models.codex.review_thinking_level`
 * (evidence/settings/NOTES.md, "Default models").
 */
export function DefaultModelsPage({ settings, save }: Props) {
  const current = settings.models.default;
  const known = agentForModel(current) !== null;
  const review = settings.models.review ?? "";
  const effort = settings.models.claude_code?.review_effort_level ?? "";
  return (
    <div className="settings-rows">
      <Row label="Default model" help="Model for new chats">
        <select
          aria-label="Default model"
          value={current}
          onChange={(e) => save(withField(settings, "models", "default", e.target.value))}
        >
          {!known && <option value={current}>{current}</option>}
          <ModelOptions />
        </select>
      </Row>
      <Row label="Review model" help="Model for the Review button's code reviews">
        <select
          aria-label="Review model"
          value={review}
          onChange={(e) => save(withField(settings, "models", "review", e.target.value || null))}
        >
          <option value="">{`Default (${modelLabel(REVIEW_FALLBACK)})`}</option>
          {review && agentForModel(review) === null && <option value={review}>{review}</option>}
          <ModelOptions />
        </select>
      </Row>
      <Row label="Review effort" help="Reasoning effort for Claude code reviews">
        <select
          aria-label="Review effort"
          value={effort}
          onChange={(e) => save(withReviewEffort(settings, e.target.value as ClaudeEffortLevel | ""))}
        >
          <option value="">Default</option>
          {CLAUDE_EFFORT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l === "xhigh" ? "Extra high" : l.charAt(0).toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
      </Row>
    </div>
  );
}
