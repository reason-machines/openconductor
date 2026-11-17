// Test-harness teardown only. Never search by name, HOME, port or executable.
// Ownership comes from the driver's observed descendant identities BEFORE the
// session/driver exit can reparent them. Receipts remain a separate observer.
import { processSnapshot, readProcess } from "./runtime-receipt.mjs";

export async function stopObservedProcesses(observed, {
  procRoot = "/proc", signalProcess = (pid, signal) => process.kill(pid, signal),
  graceMs = 750, sampleMs = 25,
} = {}) {
  if (observed?.status !== "observed" || !observed.tree?.length) return { status: "unverified" };
  const known = new Map();
  let incomplete = false;
  const remember = (p) => {
    if (!Number.isSafeInteger(p.pid) || p.pid <= 1 || (procRoot === "/proc" && p.pid === process.pid) || !p.startTicks) { incomplete = true; return; }
    known.set(`${p.pid}:${p.startTicks}`, p);
  };
  observed.tree.forEach(remember);
  const current = (old) => {
    try {
      const now = readProcess(procRoot, old.pid);
      return now.startTicks === old.startTicks && !["Z", "X"].includes(now.state) ? now : null;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH") incomplete = true;
      return null;
    }
  };
  const live = () => {
    // Include descendants born after the initial observation, but only below
    // still-matching owned identities. A recycled PID cannot admit a new tree.
    for (const old of [...known.values()]) {
      if (!current(old)) continue;
      const state = processSnapshot(old.pid, { procRoot });
      if (state.status !== "observed") { incomplete = true; continue; }
      if (state.tree.some((p) => p.pid === old.pid && p.startTicks === old.startTicks)) state.tree.forEach(remember);
    }
    return [...known.values()].map(current).filter(Boolean);
  };
  const sent = new Set();
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    const deadline = Date.now() + graceMs;
    do {
      const running = live();
      if (!running.length) return { status: incomplete ? "unverified" : "stopped" };
      // All descendants are captured first; revalidate PID/start ticks immediately before signalling.
      for (const old of running.reverse()) {
        const key = `${old.pid}:${old.startTicks}:${signal}`;
        if (sent.has(key) || !current(old)) continue;
        try { signalProcess(old.pid, signal); sent.add(key); }
        catch (error) { if (error.code !== "ESRCH") incomplete = true; }
      }
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(sampleMs, Math.max(0, deadline - Date.now()))));
    } while (true);
  }
  const survivors = live().map(({ pid, startTicks }) => ({ pid, startTicks }));
  return { status: survivors.length ? "failed" : incomplete ? "unverified" : "stopped", survivors };
}
