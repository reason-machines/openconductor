// Settings › Agents › Reason. Placeholder from the page-shell PR; the Reason
// slice owns this file and builds the tab on kit.tsx.
import type { AgentTabProps } from "./ClaudeTab";

export function ReasonTab(_props: AgentTabProps) {
  return <p className="ag-muted ag-text-sm">Reason is installed and signed in through the Reason installer.</p>;
}
