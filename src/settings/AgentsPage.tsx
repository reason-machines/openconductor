import { useEffect, useState } from "react";
import { Row } from "./GeneralPage";
import { connectProvider, disconnectProvider, errorText, providerStatus } from "./api";
import {
  configFromForm,
  formFromConfig,
  emptyForm,
  KIND_LABEL,
  KINDS_FOR,
  missingFields,
  PROVIDER_AGENT_LABEL,
  PROVIDER_AGENTS,
  secretInputs,
  secretKeys,
  SECRET_LABEL,
  visibleFields,
  type FormValues,
  type ProviderAgent,
  type ProviderForm,
} from "./providers";
import { DEFAULT_PROVIDER, type ProviderKind, type ProviderStatus, type Settings } from "./types";

interface Props {
  settings: Settings;
  /** Re-reads settings after connect/disconnect, which write the file themselves. */
  reload: () => void;
}

/**
 * Settings › Agents (Conductor's `providers` route): how each agent CLI is
 * authenticated. Keys are write-only: they go in through `connect_provider`
 * and come back only as stored or not. Conductor's tab also has "Use Claude
 * Code with Chrome" and per-provider model overrides; neither is shown yet
 * (evidence/settings/NOTES.md, "Agents").
 */
export function AgentsPage({ settings, reload }: Props) {
  return (
    <div className="settings-agents">
      {PROVIDER_AGENTS.map((agent) => (
        <AgentProvider key={agent} agent={agent} settings={settings} reload={reload} />
      ))}
    </div>
  );
}

function AgentProvider({ agent, settings, reload }: { agent: ProviderAgent } & Props) {
  const stored = settings.providers[agent] ?? null;
  const storedKey = JSON.stringify(stored);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [form, setForm] = useState<ProviderForm>(() => (stored ? formFromConfig(stored) : emptyForm(DEFAULT_PROVIDER[agent])));
  const [keys, setKeys] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(stored ? formFromConfig(stored) : emptyForm(DEFAULT_PROVIDER[agent]));
    providerStatus(agent).then(setStatus, (e) => setError(errorText(e)));
    // storedKey stands in for `stored`, a new object on every settings load.
  }, [agent, storedKey]);

  const present = new Set(status?.kind === form.kind ? status.secrets.filter((s) => s.present).map((s) => s.key) : []);
  const missing = missingFields(form);
  const setValue = (name: string, value: string) => setForm({ ...form, values: { ...form.values, [name]: value } });

  const run = async (action: () => Promise<ProviderStatus>) => {
    setBusy(true);
    try {
      setStatus(await action());
      setKeys({});
      setError(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(() => connectProvider(agent, configFromForm(form, stored), secretInputs(form, keys)));
  const disconnect = () => {
    if (stored && window.confirm(`Disconnect ${KIND_LABEL[stored.kind]}? Its stored keys are deleted.`)) run(() => disconnectProvider(agent));
  };

  return (
    <section className="settings-agent" aria-label={PROVIDER_AGENT_LABEL[agent]}>
      <header className="settings-agent-header">
        <h2>{PROVIDER_AGENT_LABEL[agent]}</h2>
        {status && (
          <span className={`settings-agent-status ${status.ready ? "ok" : "warn"}`}>
            {status.ready ? `Using ${KIND_LABEL[status.kind]}` : `${KIND_LABEL[status.kind]}: ${status.problem ?? "not ready"}`}
          </span>
        )}
      </header>
      <div className="settings-rows">
        <Row label="Provider">
          <select
            aria-label={`${PROVIDER_AGENT_LABEL[agent]} provider`}
            value={form.kind}
            onChange={(e) => {
              const kind = e.target.value as ProviderKind;
              setForm(stored?.kind === kind ? formFromConfig(stored) : emptyForm(kind));
            }}
          >
            {KINDS_FOR[agent].map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Row>
        {visibleFields(form).map((f) => (
          <Row key={f.name} label={f.label} help={f.help}>
            {f.options ? (
              <select aria-label={f.label} value={form.values[f.name] ?? ""} onChange={(e) => setValue(f.name, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                aria-label={f.label}
                placeholder={f.required ? "Required" : "Optional"}
                value={form.values[f.name] ?? ""}
                onChange={(e) => setValue(f.name, e.target.value)}
              />
            )}
          </Row>
        ))}
        {secretKeys(form).map((key) => (
          <Row key={key} label={SECRET_LABEL[key] ?? key} help={present.has(key) ? "Stored in the Keychain. Leave blank to keep it." : undefined}>
            <input
              type="password"
              autoComplete="off"
              aria-label={SECRET_LABEL[key] ?? key}
              placeholder={present.has(key) ? "••••••••" : "Not set"}
              value={keys[key] ?? ""}
              onChange={(e) => setKeys({ ...keys, [key]: e.target.value })}
            />
          </Row>
        ))}
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <div className="settings-agent-actions">
        {stored && (
          <button className="btn btn-small" disabled={busy} onClick={disconnect}>
            Disconnect
          </button>
        )}
        <button
          className="btn btn-small btn-primary"
          disabled={busy || missing.length > 0}
          title={missing.length ? `Fill in: ${missing.join(", ")}` : undefined}
          onClick={connect}
        >
          Save
        </button>
      </div>
    </section>
  );
}

