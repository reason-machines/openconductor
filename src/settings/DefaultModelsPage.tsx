import { Row } from "./GeneralPage";
import { withField } from "./model";
import { AGENT_LABEL, agentForModel, CLAUDE_ALIASES, MODEL_CATALOG, modelLabel, type ModelAgent } from "./models";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › Default models. Conductor's tab also has Codex personality,
 * Claude output style, Review model and Default to plan mode, and its
 * Default model row is a loadout picker with effort per model; only the
 * model itself is read here (by the new-workspace dialog), so only it is shown
 * (evidence/settings/NOTES.md, "Default models").
 */
export function DefaultModelsPage({ settings, save }: Props) {
  const current = settings.models.default;
  const known = agentForModel(current) !== null;
  return (
    <div className="settings-rows">
      <Row label="Default model" help="Model for new chats">
        <select
          aria-label="Default model"
          value={current}
          onChange={(e) => save(withField(settings, "models", "default", e.target.value))}
        >
          {!known && <option value={current}>{current}</option>}
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
      </Row>
    </div>
  );
}
