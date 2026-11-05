// Reason's open permission requests for a chat (ACP `session/request_permission`),
// shown above the composer while the session is `needs_user_permission`. The
// copy follows Conductor's tool approval ("Approve tool use", "<tool> requires
// your permission.", index-BGEQ8YjU.js TOOL_APPROVAL handler); the choices are
// the options Reason sends, plus Deny, which answers `cancelled`.
import type { PermissionPrompt } from "./reasonChat.ts";

interface Props {
  permissions: readonly PermissionPrompt[];
  onAnswer: (requestId: string, optionId: string | null) => void;
}

export function PermissionRequests({ permissions, onAnswer }: Props) {
  if (permissions.length === 0) return null;
  return (
    <div className="chat-permissions">
      {permissions.map((p) => (
        <section key={p.requestId} className="chat-permission" role="alertdialog" aria-label="Approve tool use" data-testid="chat-permission-request">
          <div className="chat-permission-text">
            <strong>Approve tool use</strong>
            <span>
              <code>{p.title}</code> requires your permission.
            </span>
          </div>
          <div className="chat-permission-actions">
            {p.options.map((o) => (
              <button key={o.optionId} type="button" className={`btn btn-small${o.kind.startsWith("allow") ? " btn-primary" : ""}`} data-kind={o.kind} onClick={() => onAnswer(p.requestId, o.optionId)}>
                {o.name || o.optionId}
              </button>
            ))}
            {p.options.some((o) => o.kind.startsWith("reject")) ? null : (
              <button type="button" className="btn btn-small" onClick={() => onAnswer(p.requestId, null)}>
                Deny
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
