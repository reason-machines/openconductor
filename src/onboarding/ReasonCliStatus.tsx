import { useState, useSyncExternalStore } from "react";
import { reasonCliSetup, startReasonCliSetup, subscribeReasonCliSetup } from "./reasonCli";

/**
 * The background Reason CLI install or update, in-flow where it is placed
 * (the sidebar footer, or a corner of onboarding). It never covers the app
 * and clears itself once the CLI is current.
 */
export function ReasonCliStatus() {
  const cli = useSyncExternalStore(subscribeReasonCliSetup, reasonCliSetup);
  const [dismissed, setDismissed] = useState<typeof cli>();
  if (dismissed === cli) return null;
  const dismiss = <button type="button" className="sb-cli-action" aria-label="Dismiss" onClick={() => setDismissed(cli)}>×</button>;
  if (cli.status === "installing")
    return <span className="sb-cli-status" role="status" data-testid="reason-cli-status" data-state="installing" title="Installing or updating the Reason CLI in the background">Installing or updating the Reason CLI in the background</span>;
  if (cli.status === "error")
    return (
      <span className="sb-cli-status" role="alert" data-testid="reason-cli-status" data-state="error" title={cli.message}>
        <span className="sb-cli-text">Couldn't set up the Reason CLI: {cli.message}</span>
        <button type="button" className="sb-cli-action" onClick={startReasonCliSetup}>Retry setup</button>
        {dismiss}
      </span>
    );
  if (cli.status === "ready" && cli.warning)
    return (
      <span className="sb-cli-status" role="status" data-testid="reason-cli-status" data-state="warning" title={cli.warning}>
        <span className="sb-cli-text">{cli.warning}</span>
        {dismiss}
      </span>
    );
  return null;
}
