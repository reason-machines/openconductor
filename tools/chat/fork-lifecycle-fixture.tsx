import React, { Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.tsx";
import { DiffWorkerPool } from "../../src/features/diff/DiffWorkerPool.tsx";
import { TooltipProvider } from "../../src/components/ui/Tooltip.tsx";
import { KeybindingsProvider } from "../../src/keybindings/KeybindingsProvider.tsx";
import { CHAT_AGENTS } from "../../src/features/chat/agents.ts";
import { chatSnapshot } from "../../src/features/chat/reasonChat.ts";
import { workspaceChats } from "../../src/state/openChat.ts";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/scroll.css";
import "../../src/components/motion/motion.css";
import "../../src/components/motion/screens.css";

const submits: { chatId: string; text: string }[] = [];
const submit = CHAT_AGENTS.reason.submit;
CHAT_AGENTS.reason.submit = (...args) => {
  submits.push({ chatId: args[0], text: args[2] });
  submit(...args);
};

function runtime() {
  const source = submits[0]?.chatId;
  return source ? workspaceChats(source).map((chatId) => {
    const { transcript } = chatSnapshot(chatId);
    return { chatId, messageIds: transcript.messages.map((m) => m.id), activeTurn: transcript.activeTurn };
  }) : [];
}

const commits: {
  phase: string;
  selected: string | null;
  turns: (string | null)[];
  attachments: string[];
  runtime: ReturnType<typeof runtime>;
}[] = [];
const record: ProfilerOnRenderCallback = (_id, phase) => {
  commits.push({
    phase,
    selected: document.querySelector('.main-tabs [role="tab"][aria-selected="true"]')?.textContent ?? null,
    turns: [...document.querySelectorAll(".chat-scroll .oc-turn")].map((el) => el.getAttribute("data-turn-id")),
    attachments: [...document.querySelectorAll(".composer-attachment")].map((el) => el.textContent ?? ""),
    runtime: runtime(),
  });
};
Object.assign(window, { forkLifecycle: { commits, submits, runtime } });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DiffWorkerPool>
      <KeybindingsProvider>
        <TooltipProvider>
          <Profiler id="app" onRender={record}><App /></Profiler>
        </TooltipProvider>
      </KeybindingsProvider>
    </DiffWorkerPool>
  </React.StrictMode>,
);
