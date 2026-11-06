// Conductor 0.87.6 checks at startup whether an unaccepted Xcode license blocks
// git (renderApp-D_fmY7hW.js `HBr`, index-BGEQ8YjU.js `QQt` / `c3t` / `YQt`, read
// with REA as untrusted data): on macOS it runs `xcodebuild -license check 2>&1`;
// a non-zero exit whose output names the license raises a 15 s error toast whose
// "Run for me" opens Terminal on `sudo xcodebuild -license accept`.

export const XCODE_LICENSE_TITLE = "Xcode license is not accepted";
export const XCODE_LICENSE_COMMAND = "sudo xcodebuild -license accept";
export const XCODE_LICENSE_DESCRIPTION = `Run \`${XCODE_LICENSE_COMMAND}\` in terminal to continue`;
export const XCODE_LICENSE_TOAST_MS = 15_000;

/** Conductor's `c3t`: output that means the license is what fails. */
const LICENSE_PHRASES = ["you have not agreed to the xcode license agreements", "run 'sudo xcodebuild -license'", "xcode license"];

export interface ShellOut {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export type Shell = (command: string) => Promise<ShellOut>;

/** True when, on macOS, `xcodebuild -license check` fails because the license is not accepted. */
export async function xcodeLicenseBlocked(platform: string, run: Shell): Promise<boolean> {
  if (platform !== "macos") return false;
  const out = await run("xcodebuild -license check 2>&1");
  if (out.exitCode === 0) return false;
  const text = `${out.stdout} ${out.stderr}`.toLowerCase();
  return LICENSE_PHRASES.some((p) => text.includes(p));
}

/** Conductor's `YQt` on macOS: Terminal runs `command` in a new window. */
export function openInTerminalScript(command: string): string {
  const asAppleScript = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "'\\''");
  return `osascript -e 'tell application "Terminal"' -e 'activate' -e 'do script "${asAppleScript}"' -e 'end tell'`;
}
