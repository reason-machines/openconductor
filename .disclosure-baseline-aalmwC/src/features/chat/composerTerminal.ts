import type { TabsState } from "../terminal/tabs.ts";
import { stripAnsi } from "../../scripts/model.ts";

/** Existing read-only IPC. Selection policy stays in the backend resolver. */
export function terminalOutputRequest(workspaceId: string, state: TabsState) {
  return {
    workspaceId,
    source: "auto",
    maxLines: 1000,
    panelTerminalIds: state.tabs.filter((tab) => tab.placement !== "center").map((tab) => tab.id),
    tabTerminalIds: state.tabs.filter((tab) => tab.placement === "center").map((tab) => tab.id),
    activeTerminalId: state.activeId,
    preferredTerminalId: null,
  };
}

/** G9/c7t in the retained renderer. Positive staging is static, not native delivery proof. */
export function terminalOutputFiles(value: unknown, now = Date.now()): File[] {
  if (!value || typeof value !== "object") throw new Error("Invalid terminal output response");
  if ("error" in value && value.error !== undefined && value.error !== null) {
    if (typeof value.error !== "string") throw new Error("Invalid terminal output response");
    if (value.error) throw new Error(value.error);
  }
  if (!("source" in value)) throw new Error("Invalid terminal output response");
  if (value.source === "none") throw new Error("No terminal output available for this workspace");
  let label: string;
  switch (value.source) {
    case "terminal": label = "Terminal"; break;
    case "run_script": label = "Run script"; break;
    case "spotlight": label = "Spotlight"; break;
    default: throw new Error("Invalid terminal output response");
  }
  if (!("output" in value) || typeof value.output !== "string" || !("isRunning" in value) || typeof value.isRunning !== "boolean") throw new Error("Invalid terminal output response");
  const output = stripAnsi(value.output).replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/gu, "").replace(/\r\n?/g, "\n").trim();
  return [new File([`Source: ${label}\nStatus: ${value.isRunning ? "running" : "stopped"}\n\n${output}`], `terminal-output-${value.source}-${now}.txt`, { type: "text/plain" })];
}
