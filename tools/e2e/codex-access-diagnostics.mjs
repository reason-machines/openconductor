export function installCodexAccessDiagnostics(expectedChatId) {
  const name = "__ocCodexAccessDiagnostics";
  if (window[name]) throw new Error("Codex access diagnostics already installed");
  const ipc = window.__TAURI_INTERNALS__;
  const originalInvoke = ipc.invoke;
  const entries = [];
  const nodeIds = new WeakMap();
  let nextNodeId = 0;
  let sequence = 0;
  let dropped = 0;
  const policy = (chatId) => {
    if (!chatId) return null;
    const value = localStorage.getItem(`openconductor.codex.policy.${chatId}`);
    return value === null || ["ask", "full", "read-only"].includes(value) ? value : "unrecognized";
  };
  const retain = (entry) => {
    if (entries.length < 64) entries.push(entry);
    else dropped++;
    return entry;
  };
  const capture = (phase, select = document.querySelector(".codex-access")) => {
    if (select && !nodeIds.has(select)) nodeIds.set(select, ++nextNodeId);
    const rect = select?.getBoundingClientRect();
    const style = select ? getComputedStyle(select) : null;
    const activeChatId = select?.dataset.chatId ?? null;
    return retain({
      sequence: ++sequence,
      phase,
      expectedChatId,
      activeChatId,
      selectorCount: document.querySelectorAll(".codex-access").length,
      nodeId: select ? nodeIds.get(select) : null,
      connected: select?.isConnected ?? false,
      disabled: select?.disabled ?? null,
      visible: !!select && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && !select.closest("[hidden]"),
      value: select?.value ?? null,
      persistedPolicy: policy(expectedChatId),
      activePersistedPolicy: policy(activeChatId),
    });
  };
  const captureChange = (event) => {
    if (event.target?.matches(".codex-access")) capture("change-capture", event.target);
  };
  const bubbleChange = (event) => {
    if (event.target?.matches(".codex-access")) capture("change-bubble", event.target);
  };
  function invoke(command, args, ...rest) {
    if (command === "codex_open_chat") {
      const entry = capture("codex_open_chat");
      entry.invocation = {
        chatId: args?.chatId ?? null,
        approvalPolicy: args?.policy?.approvalPolicy ?? null,
        sandbox: args?.policy?.sandbox ?? null,
      };
    }
    return Reflect.apply(originalInvoke, this, [command, args, ...rest]);
  }
  document.addEventListener("change", captureChange, true);
  document.addEventListener("change", bubbleChange);
  ipc.invoke = invoke;
  window[name] = {
    capture,
    read: () => ({ schemaVersion: 1, expectedChatId, dropped, entries }),
    restore: () => {
      document.removeEventListener("change", captureChange, true);
      document.removeEventListener("change", bubbleChange);
      if (ipc.invoke === invoke) ipc.invoke = originalInvoke;
    },
  };
  return capture("installed");
}
