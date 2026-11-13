import { invoke } from "@tauri-apps/api/core";
import { SETTINGS_CHANGED } from "./appearance";
import { getSettings } from "./api";
import { chatStatuses, subscribeChatStatuses } from "../features/chat/chatRuntime";
import type { Settings } from "./types";

const LOW_BATTERY_THRESHOLD = 10;
const BATTERY_POLL_INTERVAL_MS = 60_000;

/** Parsed output of `pmset -g batt`. Conductor's battery state type. */
interface BatteryState {
  powerSource: "battery" | "ac";
  percent: number;
}

interface ShellOutput {
  stdout: string;
  exitCode: number | null;
}

function parsePowerSource(line: string): "battery" | "ac" | undefined {
  const src = line.match(/Now drawing from '([^']+)'/)?.[1].toLowerCase();
  if (src === "battery power") return "battery";
  if (src === "ac power") return "ac";
}

function parseBatteryLine(
  line: string,
  fallback: "battery" | "ac" | undefined,
): { powerSource: "battery" | "ac"; percent: number } | undefined {
  const m = line.match(/(\d+)%/);
  if (!m) return;
  const lower = line.toLowerCase();
  let powerSource: "battery" | "ac" | undefined = fallback;
  if (lower.includes("; discharging;")) powerSource = "battery";
  else if (lower.includes("; charging;") || lower.includes("; charged;")) powerSource = "ac";
  if (powerSource !== undefined) return { powerSource, percent: Number(m[1]) };
}

/** Parse `pmset -g batt` stdout into a BatteryState, or undefined when unavailable. */
export function parseBatteryOutput(output: string): BatteryState | undefined {
  let powerSource: "battery" | "ac" | undefined;
  let result: BatteryState | undefined;
  for (const line of output.split(/\r?\n/)) {
    const src = parsePowerSource(line);
    if (src !== undefined) powerSource = src;
    const state = parseBatteryLine(line, powerSource);
    if (state !== undefined) {
      powerSource = state.powerSource;
      result = state;
    }
  }
  return result;
}

async function readBatteryState(): Promise<BatteryState | undefined> {
  try {
    const out = await invoke<ShellOutput>("execute_shell_command", { request: { command: "pmset -g batt" } });
    if (out.exitCode !== 0) return undefined;
    return parseBatteryOutput(out.stdout);
  } catch {
    return undefined;
  }
}

let seq = 0;

/**
 * Runs `caffeinate -i` on macOS while `caffeinate_while_agents_running` is on
 * and an agent session is `working` or `waiting`. Stops automatically when
 * battery drops to 10% or below on battery power.
 *
 * Conductor's `dAa`. Retries cancellation until the native command acknowledges
 * it, covering the race where a stop intent precedes native process registration.
 */
export class CaffeinateConsumer {
  private settings: Settings | null = null;
  private batteryState: BatteryState | undefined;
  private stopStatusUnsubscribe: (() => void) | null = null;
  private stopBatteryPolling: (() => void) | null = null;
  private pendingId: string | undefined;
  private started = false;

  updateSettings(settings: Settings): void {
    this.settings = settings;
    if (this.started) this.updateDesiredState();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    readBatteryState().then(
      (state) => this.activate(state),
      () => this.activate(undefined),
    );
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.stopStatusUnsubscribe?.();
    this.stopStatusUnsubscribe = null;
    this.stopBatteryPolling?.();
    this.stopBatteryPolling = null;
    this.stopCaffeinate();
  }

  private activate(batteryState: BatteryState | undefined): void {
    if (!this.started) return;
    this.batteryState = batteryState;
    this.stopStatusUnsubscribe = subscribeChatStatuses(() => {
      if (this.started) this.updateDesiredState();
    });
    this.stopBatteryPolling = this.startBatteryPolling();
    this.updateDesiredState();
  }

  private startBatteryPolling(): () => void {
    let active = true;
    let pollPending = false;
    const timer = setInterval(() => {
      if (pollPending) return;
      pollPending = true;
      readBatteryState().then(
        (state) => {
          pollPending = false;
          if (active) { this.batteryState = state; this.updateDesiredState(); }
        },
        () => {
          pollPending = false;
          if (active) { this.batteryState = undefined; this.updateDesiredState(); }
        },
      );
    }, BATTERY_POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(timer); };
  }

  private shouldCaffeinateWithoutBattery(): boolean {
    if (!this.settings?.general?.caffeinate_while_agents_running) return false;
    for (const status of chatStatuses().values()) {
      if (status === "working" || status === "waiting") return true;
    }
    return false;
  }

  private isLowBattery(): boolean {
    return (
      this.batteryState?.powerSource === "battery" &&
      this.batteryState.percent <= LOW_BATTERY_THRESHOLD
    );
  }

  private updateDesiredState(): void {
    if (!this.started) return;
    const want = this.shouldCaffeinateWithoutBattery() && !this.isLowBattery();
    if (want) {
      this.startCaffeinate();
    } else {
      this.stopCaffeinate();
    }
  }

  private startCaffeinate(): void {
    if (this.pendingId !== undefined) return;
    const id = `caffeinate-${Date.now()}-${seq++}`;
    this.pendingId = id;
    invoke<ShellOutput>("execute_shell_command_cancellable", {
      id,
      request: { command: "exec caffeinate -i" },
    }).then(
      () => this.onCaffeinateExit(id),
      () => this.onCaffeinateExit(id),
    );
  }

  private onCaffeinateExit(id: string): void {
    if (this.pendingId === id) {
      this.pendingId = undefined;
      if (this.started && this.shouldCaffeinateWithoutBattery() && !this.isLowBattery()) {
        this.startCaffeinate();
      }
    }
  }

  private stopCaffeinate(): void {
    const id = this.pendingId;
    if (id === undefined) return;
    this.pendingId = undefined;
    void this.tryCancelRepeatedly(id);
  }

  /**
   * Retry `cancel_shell_command` until the native side acknowledges it.
   * The first call may return false when a stop intent precedes native process
   * registration (Conductor's deferred spawn → `child` transition). Conductor's
   * `dAa.stopCaffeinate` and `startCaffeinate.then` together cover this race;
   * this loop is the equivalent in OpenConductor's single-invoke model.
   */
  private async tryCancelRepeatedly(id: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
      const acknowledged = await invoke<boolean>("cancel_shell_command", { id }).catch(() => true);
      if (acknowledged) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
}

/**
 * Wire the caffeinate consumer into the app lifecycle.
 * Reads initial settings, then tracks changes via SETTINGS_CHANGED.
 * Called once from main.tsx.
 */
export function startCaffeinateConsumer(): CaffeinateConsumer {
  const consumer = new CaffeinateConsumer();
  const refresh = () => {
    getSettings().then((s) => consumer.updateSettings(s)).catch(() => undefined);
  };
  window.addEventListener(SETTINGS_CHANGED, refresh);
  getSettings().then((s) => {
    consumer.updateSettings(s);
    consumer.start();
  }).catch(() => consumer.start());
  return consumer;
}
