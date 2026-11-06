import { test } from "node:test";
import assert from "node:assert/strict";
import { openInTerminalScript, xcodeLicenseBlocked, type ShellOut } from "./xcodeLicense.ts";

const shell = (out: ShellOut, seen: string[] = []) => async (command: string) => (seen.push(command), out);

test("only macOS runs the check", async () => {
  const seen: string[] = [];
  assert.equal(await xcodeLicenseBlocked("linux", shell({ stdout: "Xcode license", stderr: "", exitCode: 1 }, seen)), false);
  assert.deepEqual(seen, []);
});

test("an accepted license (exit 0) does not block", async () => {
  const seen: string[] = [];
  assert.equal(await xcodeLicenseBlocked("macos", shell({ stdout: "", stderr: "", exitCode: 0 }, seen)), false);
  assert.deepEqual(seen, ["xcodebuild -license check 2>&1"]);
});

test("a failure that names the license blocks", async () => {
  const msg = "You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild -license' from within a Terminal window";
  assert.equal(await xcodeLicenseBlocked("macos", shell({ stdout: msg, stderr: "", exitCode: 69 })), true);
});

test("other failures (no Xcode, only the command line tools) do not", async () => {
  const msg = "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory is a command line tools instance";
  assert.equal(await xcodeLicenseBlocked("macos", shell({ stdout: msg, stderr: "", exitCode: 1 })), false);
});

test("Run for me opens Terminal on the accept command", () => {
  assert.equal(
    openInTerminalScript("sudo xcodebuild -license accept"),
    `osascript -e 'tell application "Terminal"' -e 'activate' -e 'do script "sudo xcodebuild -license accept"' -e 'end tell'`,
  );
});
