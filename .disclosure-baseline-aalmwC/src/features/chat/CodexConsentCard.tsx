// The card for an open Codex consent: an MCP server that needs information,
// or Codex asking for permissions. Wording and buttons follow Conductor
// 0.87.6's card (`JVn` and its form, structured-JSON, URL and permission
// bodies in the renderApp chunk); see `codexConsent.ts`.

import { useState } from "react";
import { openUrl } from "../../backend";
import { formContent, formFields, initialValues, permissionLines, structuredContent, type CodexConsent, type ConsentAnswer, type FormValue } from "./codexConsent.ts";

type Respond = (answer: ConsentAnswer) => void;

function Actions({ onCancel, onContinue }: { onCancel: () => void; onContinue: () => void }) {
  return (
    <div className="codex-approval-actions">
      <button type="button" className="btn btn-small" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="btn btn-small btn-primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

function Problem({ error }: { error: string | undefined }) {
  return error ? (
    <div className="codex-consent-error" role="alert">
      {error}
    </div>
  ) : null;
}

function FormBody({ consent, onRespond }: { consent: CodexConsent; onRespond: Respond }) {
  const fields = formFields(consent.requestedSchema);
  const [values, setValues] = useState<Record<string, FormValue>>(() => initialValues(consent.requestedSchema));
  const [error, setError] = useState<string>();
  const set = (name: string, v: FormValue) => setValues((prev) => ({ ...prev, [name]: v }));
  const submit = () => {
    const r = formContent(fields, values);
    if ("error" in r) return setError(r.error);
    onRespond({ action: "accept", content: r.content });
  };
  return (
    <>
      <div className="codex-consent-fields">
        {fields.map((f) => {
          const id = `codex-consent-${String(consent.requestId)}-${f.name}`;
          const label = `${f.label}${f.required ? " *" : ""}`;
          if (f.type === "boolean") {
            return (
              <label key={f.name} className="codex-consent-check" htmlFor={id}>
                <input id={id} type="checkbox" checked={values[f.name] === true} onChange={(e) => set(f.name, e.target.checked)} />
                {label}
              </label>
            );
          }
          return (
            <label key={f.name} className="codex-consent-field" htmlFor={id}>
              <span>{label}</span>
              {f.description ? <span className="muted">{f.description}</span> : null}
              {f.type === "enum" ? (
                <select id={id} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={id} type={f.type === "string" ? "text" : "number"} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
              )}
            </label>
          );
        })}
      </div>
      <Problem error={error} />
      <Actions onCancel={() => onRespond({ action: "cancel" })} onContinue={submit} />
    </>
  );
}

function StructuredBody({ consent, onRespond }: { consent: CodexConsent; onRespond: Respond }) {
  const [text, setText] = useState("{}");
  const [error, setError] = useState<string>();
  const id = `codex-consent-${String(consent.requestId)}-json`;
  const submit = () => {
    const r = structuredContent(text);
    if ("error" in r) return setError(r.error);
    onRespond({ action: "accept", content: r.content });
  };
  return (
    <>
      <label className="codex-consent-field" htmlFor={id}>
        <span>Structured response (JSON)</span>
        <textarea id={id} className="codex-approval-command" spellCheck={false} value={text} aria-invalid={error !== undefined} onChange={(e) => setText(e.target.value)} />
      </label>
      <Problem error={error} />
      <Actions onCancel={() => onRespond({ action: "cancel" })} onContinue={submit} />
    </>
  );
}

function UrlBody({ consent, onRespond }: { consent: CodexConsent; onRespond: Respond }) {
  return (
    <div className="codex-approval-actions">
      {consent.url ? (
        <button type="button" className="btn btn-small" onClick={() => void openUrl(consent.url!)}>
          Open authorization page
        </button>
      ) : null}
      <button type="button" className="btn btn-small" onClick={() => onRespond({ action: "cancel" })}>
        Cancel
      </button>
      <button type="button" className="btn btn-small btn-primary" onClick={() => onRespond({ action: "accept" })}>
        Continue
      </button>
    </div>
  );
}

function PermissionsBody({ consent, onRespond }: { consent: CodexConsent; onRespond: Respond }) {
  const lines = permissionLines(consent.permissions);
  return (
    <>
      {consent.reason ? <div className="muted">{consent.reason}</div> : null}
      {lines.length > 0 ? (
        <ul className="codex-consent-perms">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <div className="codex-approval-actions">
        <button type="button" className="btn btn-small" onClick={() => onRespond({ action: "decline" })}>
          Deny
        </button>
        <button type="button" className="btn btn-small btn-primary" onClick={() => onRespond({ action: "grant", grantedPermissions: consent.permissions, scope: "turn" })}>
          Approve
        </button>
      </div>
    </>
  );
}

export function CodexConsentCard({ consent, onRespond }: { consent: CodexConsent; onRespond: Respond }) {
  const permissions = consent.kind === "permissions";
  const title = permissions ? `${consent.serverName} requests permission` : `${consent.serverName} needs information`;
  return (
    <div className="codex-approval codex-consent" role="alertdialog" aria-label={title} data-testid="codex-consent" data-kind={consent.kind}>
      <div className="codex-approval-title">{title}</div>
      {permissions ? (
        <PermissionsBody consent={consent} onRespond={onRespond} />
      ) : (
        <>
          {consent.message ? <div className="muted">{consent.message}</div> : null}
          {consent.mode === "form" ? (
            <FormBody consent={consent} onRespond={onRespond} />
          ) : consent.mode === "openai/form" ? (
            <StructuredBody consent={consent} onRespond={onRespond} />
          ) : (
            <UrlBody consent={consent} onRespond={onRespond} />
          )}
        </>
      )}
    </div>
  );
}
