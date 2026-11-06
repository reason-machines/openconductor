// Verifier harness, not app code: mounts the app's real Composer and
// ModelPicker where Conductor's reference screenshots put its composer
// (1440×900, chat column x 256–1045, bottom of the window), with the slash
// commands of the agent named by ?agent= (claude, codex, acp). A Reason chat
// (acp) gets no commands from Reason 0.2.665, so the "/" menu's look is
// checked here with Conductor's Claude Code set. ?theme=light|dark.
import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { KeybindingsProvider } from "../../src/keybindings/KeybindingsProvider";
import { Composer } from "../../src/features/chat/Composer";
import { ModelPicker } from "../../src/features/chat/ModelPicker";
import { commandSet, type ComposerAgent } from "../../src/features/chat/slashCommands";
import { emptyQueue } from "../../src/features/chat/queue";
import type { ModelChoice } from "../../src/features/chat/composerModels";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const agent = (params.get("agent") ?? "claude") as ComposerAgent;
document.documentElement.dataset.theme = params.get("theme") ?? "dark";

function Demo() {
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<ModelChoice>({ model: agent === "codex" ? "gpt-5.6-sol" : "opus-5-1m", effort: "high" });
  const input = useRef<HTMLTextAreaElement>(null);
  const commands = commandSet({ agent, planMode: agent === "acp" ? undefined : { isPlanMode: false }, fastMode: { isFastMode: !!model.fast } });
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)" }}>
      <div style={{ position: "absolute", left: 256, width: 789, bottom: 0 }}>
        <Composer
          draft={draft}
          setDraft={setDraft}
          inputRef={input}
          queue={emptyQueue()}
          canSteer
          onSubmit={() => setDraft("")}
          onStop={() => undefined}
          onQueue={() => undefined}
          onAttachFiles={() => undefined}
          picker={<ModelPicker value={model} onChange={setModel} onOpenSettings={() => undefined} fastSupported />}
          slashCommands={commands}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <KeybindingsProvider>
    <Demo />
  </KeybindingsProvider>,
);
