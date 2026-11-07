import { useEffect, useState } from "react";
import { settingsFilePath } from "./api";
import { ClaudeTab, type AgentTabProps } from "./agents/ClaudeTab";
import { CodexTab } from "./agents/CodexTab";
import { ReasonTab } from "./agents/ReasonTab";
import { AgentMark, ReasonMark } from "./agents/icons";
import { AGENTS_TABS, AGENTS_TAB_LABEL, AgentTabRow, AgentsHeader, type AgentsTab, type TabSpec } from "./agents/kit";
import { selectProviderTab, useProviderTab } from "./providerTab";
import "./agents/agents.css";

const TABS: readonly TabSpec<AgentsTab>[] = AGENTS_TABS.map((id) => ({
  id,
  label: AGENTS_TAB_LABEL[id],
  icon: id === "reason" ? <ReasonMark size={14} /> : <AgentMark agent={id} size={14} />,
}));

/**
 * Settings › Agents (Conductor's `/settings/user/providers`, `Upa`/`$pa`),
 * redesigned by Sven: "Agents" with "Open settings.toml", then the Reason,
 * Claude Code and Codex tabs. The open tab follows `?providerTab=`, so a chat
 * whose agent is not signed in can link straight to its tab. Each tab lives
 * in src/settings/agents/<Agent>Tab.tsx and is built from agents/kit.tsx.
 */
export function AgentsPage(props: AgentTabProps) {
  const tab = useProviderTab();
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  useEffect(() => {
    settingsFilePath().then(setSettingsPath, () => setSettingsPath(null));
  }, []);
  return (
    <div className="oc-ag ag-page">
      <AgentsHeader settingsPath={settingsPath} />
      <AgentTabRow tabs={TABS} value={tab} onChange={selectProviderTab} />
      <section role="tabpanel" aria-label={AGENTS_TAB_LABEL[tab]}>
        {tab === "reason" && <ReasonTab {...props} />}
        {tab === "claude" && <ClaudeTab {...props} />}
        {tab === "codex" && <CodexTab {...props} />}
      </section>
    </div>
  );
}
