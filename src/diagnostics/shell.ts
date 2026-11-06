// The diagnostics shell runner: Conductor's `BHe` over OpenConductor's
// `execute_shell_command_cancellable` / `cancel_shell_command`.
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_TIMEOUT_MS, shellResult, zshNoRcs, type ShellRun } from "./checks";

interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

let seq = 0;

/** Runs `command` in zsh without rc files; "[error] timed out" after `timeoutMs`, cancelling it. */
export const diagnosticsShell: ShellRun = async (command, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const id = `diag-${Date.now()}-${seq++}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"__timeout">((resolve) => {
      timer = setTimeout(() => resolve("__timeout"), timeoutMs);
    });
    const out = await Promise.race([
      invoke<ShellOutput>("execute_shell_command_cancellable", { id, request: { command: zshNoRcs(command) } }),
      timeout,
    ]);
    if (out === "__timeout") {
      invoke("cancel_shell_command", { id }).catch(() => {});
      return "[error] timed out";
    }
    return shellResult(out);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
