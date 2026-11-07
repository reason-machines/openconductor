import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { KeybindingsProvider } from "../../src/keybindings/KeybindingsProvider.tsx";
import { ToolApproval } from "../../src/features/chat/PermissionRequests.tsx";
import type { ToolPrompt, PermissionAnswer } from "../../src/features/chat/chatRuntime.ts";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/features/chat/chat.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
const request: ToolPrompt = {
  kind: "permission",
  requestId: "proof-approval",
  tool: "Bash",
  title: "Bash",
  input: { command: "pnpm test src/middleware/rate-limit.test.ts", description: "Run the rate limit tests" },
  options: [{ optionId: "allow", name: "Yes", kind: "allow_once" }, { optionId: "deny", name: "No", kind: "reject_once" }],
};

function Fixture() {
  const [answer, setAnswer] = useState<PermissionAnswer | null>(null);
  return (
    <KeybindingsProvider>
      <main style={{ padding: 24 }}>
        <div className="composer oc-composer is-approval" style={{ width: Number(params.get("width") ?? 650), margin: 0, maxWidth: "none" }}>
          {answer === null ? <ToolApproval request={request} onAnswer={(_, next) => setAnswer(next)} /> : <output data-testid="proof-answer">{JSON.stringify(answer)}</output>}
        </div>
      </main>
    </KeybindingsProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Fixture />);
