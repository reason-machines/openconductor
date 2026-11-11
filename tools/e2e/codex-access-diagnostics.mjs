import assert from "node:assert/strict";

export function installCodexAccessDiagnostics(expectedChatId) {
  const name = "__ocCodexAccessDiagnostics";
  if (window[name]) throw new Error("Codex access diagnostics already installed");
  const entries = [];
  const nodes = new WeakMap();
  let nextNode = 0;
  let dropped = 0;
  const capture = (phase, event, operationReturn) => {
    const selectors = document.querySelectorAll(".codex-access");
    const select = selectors[0];
    if (select && !nodes.has(select)) nodes.set(select, ++nextNode);
    const rect = select?.getBoundingClientRect();
    const style = select ? getComputedStyle(select) : null;
    const saved = localStorage.getItem(`openconductor.codex.policy.${expectedChatId}`);
    const snapshot = {
      phase,
      expectedChatId,
      selectorCount: selectors.length,
      nodeId: select ? nodes.get(select) : null,
      connected: select?.isConnected ?? false,
      disabled: select?.disabled ?? null,
      visible: !!select && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && !select.closest("[hidden]"),
      value: ["full", "ask", "read-only"].includes(select?.value) ? select.value : null,
      persistedPolicy: saved === null || ["full", "ask", "read-only"].includes(saved) ? saved : "unrecognized",
      eventTargetIsSelector: event ? event.target === select : null,
      eventValue: event?.target === select && ["full", "ask", "read-only"].includes(select?.value) ? select.value : null,
      eventTrusted: typeof event?.isTrusted === "boolean" ? event.isTrusted : null,
      eventPhase: [1, 2, 3].includes(event?.eventPhase) ? event.eventPhase : null,
      setterReturn: phase === "after-setter" ? operationReturn === undefined ? "undefined" : "unexpected" : null,
      dispatchReturn: phase === "after-dispatch" && typeof operationReturn === "boolean" ? operationReturn : null,
    };
    if (entries.length < 64) entries.push(snapshot);
    else dropped++;
    return snapshot;
  };
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.(".codex-access")) capture("change-capture", event);
  }, true);
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.(".codex-access")) capture("change-bubble", event);
  });
  window[name] = {
    capture,
    read: () => ({ schemaVersion: 3, expectedChatId, dropped, entries }),
  };
  return capture("installed");
}

export function assertCodexAccessSnapshot(snapshot) {
  assert.equal(snapshot.selectorCount, 1, `${snapshot.phase}: exactly one access selector`);
  assert.equal(snapshot.connected, true, `${snapshot.phase}: connected access selector`);
  assert.equal(snapshot.disabled, false, `${snapshot.phase}: enabled access selector`);
  assert.equal(snapshot.visible, true, `${snapshot.phase}: visible access selector`);
  assert.equal(snapshot.value, "ask", `${snapshot.phase}: Ask first remains selected`);
  assert.equal(snapshot.persistedPolicy, "ask", `${snapshot.phase}: Ask first is saved for the expected chat`);
}

function policy(value) {
  if (value === null) return null;
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "boundary policy object");
  const result = {};
  if (value.approvalPolicy !== undefined) {
    assert.ok(["untrusted", "on-request", "never"].includes(value.approvalPolicy), "boundary approval policy");
    result.approvalPolicy = value.approvalPolicy;
  }
  if (value.sandbox !== undefined) {
    assert.ok(["read-only", "workspace-write", "danger-full-access"].includes(value.sandbox), "boundary sandbox");
    result.sandbox = value.sandbox;
  }
  return result;
}

export function codexBoundaryReport(expectedChatId, text, firstThreadStart) {
  assert.ok(Buffer.byteLength(text) <= 65536, "bounded Rust boundary log");
  const lines = text.split("\n").filter(Boolean);
  assert.ok(lines.length <= 64, "bounded Rust boundary entries");
  const events = lines.map((line) => {
    const event = JSON.parse(line);
    assert.equal(typeof event.chatId, "string", "boundary chat identity");
    assert.equal(typeof event.existingRunner, "boolean", "boundary runner disposition");
    return {
      chatId: event.chatId,
      incomingPolicy: policy(event.incomingPolicy),
      existingRunner: event.existingRunner,
      selectedPolicy: policy(event.selectedPolicy),
    };
  });
  return {
    expectedChatId,
    events,
    firstThreadStartPolicy: firstThreadStart ? policy(firstThreadStart.params) : null,
  };
}

export function assertCodexBoundary(report) {
  assert.equal(report.events.length, 1, "one first-turn Rust open boundary for the expected chat");
  const event = report.events[0];
  assert.equal(event.chatId, report.expectedChatId, "Rust opened the expected chat");
  assert.equal(event.existingRunner, false, "first open takes the new-runner branch; an existing runner's policy is unobserved");
  const expected = { approvalPolicy: "on-request", sandbox: "workspace-write" };
  assert.deepEqual(event.incomingPolicy, expected, "Rust received Ask first");
  assert.deepEqual(event.selectedPolicy, expected, "Rust selected Ask first for the new runner");
  assert.deepEqual(report.firstThreadStartPolicy, expected, "first thread/start agrees with the Rust decision");
}
