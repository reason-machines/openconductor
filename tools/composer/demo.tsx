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
import type { ComposerEditorHandle } from "../../src/features/chat/ComposerEditor";
import { appendComposerText } from "../../src/features/chat/composerDocument";
import { ModelPicker } from "../../src/features/chat/ModelPicker";
import { commandSet, type ComposerAgent } from "../../src/features/chat/slashCommands";
import { actionStep, emptyQueue, type ChatQueue } from "../../src/features/chat/queue";
import type { ModelChoice } from "../../src/features/chat/composerModels";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const agent = (params.get("agent") ?? "claude") as ComposerAgent;
document.documentElement.dataset.theme = params.get("theme") ?? "dark";
document.documentElement.dataset.colorPalette = params.get("palette") ?? "stone";

function Demo() {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [identity, setIdentity] = useState(0);
  const [model, setModel] = useState<ModelChoice>({ model: agent === "codex" ? "gpt-5.6-sol" : "opus-5-1m", effort: "high" });
  const input = useRef<ComposerEditorHandle>(null);
  const [queue, setQueue] = useState<ChatQueue>(() => ({ ...emptyQueue(), status: params.has("working") ? "working" : "idle" }));
  const [files, setFiles] = useState<File[]>([]);
  const [sent, setSent] = useState<{ text: string; mode: string; files: string[] } | null>(null);
  const commands = commandSet({ agent, planMode: agent === "acp" ? undefined : { isPlanMode: false }, fastMode: { isFastMode: !!model.fast } });
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)" }}>
      <output data-testid="composer-result" hidden>{sent ? JSON.stringify(sent) : ""}</output>
      {params.has("editing-checks") ? <div>
        <button onClick={() => setSaved(draft)}>Save draft</button>
        <button onClick={() => { setDraft(saved); setIdentity((id) => id + 1); }}>Restore draft</button>
        <button onClick={() => setDraft((value) => appendComposerText(value, "Review note"))}>Insert review note</button>
      </div> : null}
      <div style={{ position: "absolute", left: 256, width: 789, bottom: 0 }}>
        <Composer
          key={identity}
          draft={draft}
          setDraft={setDraft}
          inputRef={input}
          workspacePath="/isolated/composer-fixture"
          queue={queue}
          canSteer
          followUpMode={params.has("queued") ? "queued" : "steering"}
          onSubmit={(text, mode) => { setSent({ text, mode, files: files.map((file) => file.name) }); setDraft(""); setFiles([]); }}
          onStop={() => setQueue((current) => ({ ...current, status: "idle" }))}
          onQueue={(action) => setQueue((current) => actionStep(current, action).queue)}
          onAttachFiles={(picked) => setFiles((current) => [...current, ...picked])}
          hasAttachments={files.length > 0}
          attachments={files.length ? <div className="composer-attachments" aria-label="Attachments">{files.map((file, index) => <span key={index} className="chip composer-attachment">{file.name}<button type="button" className="composer-attachment-remove" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>×</button></span>)}</div> : null}
          picker={<ModelPicker value={model} favorites={params.has("model-arrow-checks") ? ["sonnet", "sonnet-5-1m", "sonnet-5-5-1m", "sonnet-4-6-1m"].map((model) => ({ model, effort: "high" })) : params.has("model-search-checks") ? [{ model: "sonnet", effort: "high" }] : undefined} onChange={setModel} onOpenSettings={() => undefined} fastSupported />}
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
