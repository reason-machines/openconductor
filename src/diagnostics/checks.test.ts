import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diagnosticChecks,
  progress,
  redactEnv,
  reportMarkdown,
  runDiagnostics,
  shellQuote,
  shellResult,
  shortHash,
  zshNoRcs,
  type CheckResult,
} from "./checks.ts";

test("the check list follows Conductor's order and ends with the non-zsh shell check", () => {
  const labels = diagnosticChecks().map((c) => c.label);
  assert.equal(labels.length, 59);
  assert.deepEqual(labels.slice(0, 4), ["macOS version", "CPU architecture", "Default shell (dscl)", "$SHELL"]);
  assert.deepEqual(labels.slice(-4), ["OpenConductor app env", "Disk space (root)", "System integrity protection (SIP)", "Non-zsh default shell env"]);
  assert.equal(new Set(labels).size, labels.length, "labels are row keys, so they must be unique");
});

test("env checks are the ones marked for redaction", () => {
  const env = diagnosticChecks().filter((c) => c.containsEnv).map((c) => c.label);
  assert.deepEqual(env, ["Login shell env", "Interactive login shell env", "Non-interactive non-login shell env", "OpenConductor app env", "Non-zsh default shell env"]);
});

test("a command check passes its command and deadline to the shell", async () => {
  const timing = diagnosticChecks().find((c) => c.label === "Shell init timing (zsh -ilc)")!;
  const calls: [string, number | undefined][] = [];
  await timing.run(async (command, timeoutMs) => (calls.push([command, timeoutMs]), "0.120s"));
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^start=\$EPOCHREALTIME; zsh -ilc 'true'/);
  assert.equal(calls[0][1], 12000);
});

test("the non-zsh check skips when the default shell is zsh", async () => {
  const check = diagnosticChecks().at(-1)!;
  assert.equal(await check.run(async () => "/bin/zsh"), "default shell is zsh (skipped)");
  assert.equal(await check.run(async () => "[error] exit code 1"), "default shell is zsh (skipped)");
});

test("the non-zsh check prints the other shell's PATH and env", async () => {
  const check = diagnosticChecks().at(-1)!;
  const seen: string[] = [];
  const out = await check.run(async (command) => {
    seen.push(command);
    if (command.startsWith("dscl")) return "/opt/homebrew/bin/fish\n";
    return command.includes("echo $PATH") ? "/usr/bin:/bin" : "A=1\nB=2";
  });
  assert.equal(out, "shell: /opt/homebrew/bin/fish\nPATH: /usr/bin:/bin\nenv (fish -lc):\nA=1\nB=2");
  assert.equal(seen[1], "/opt/homebrew/bin/fish -lc 'echo $PATH' 2>/dev/null");
});

test("runDiagnostics runs in order, marks a throwing check as error and publishes each step", async () => {
  const updates: CheckResult[][] = [];
  const report = await runDiagnostics(
    [
      { label: "a", run: async (sh) => sh("echo a") },
      { label: "b", containsEnv: true, run: async () => { throw new Error("boom"); } },
    ],
    async (c) => c.replace("echo ", ""),
    (r) => updates.push(r),
    () => new Date("2026-11-06T10:00:00Z"),
  );
  assert.deepEqual(report, {
    generatedAt: "2026-11-06T10:00:00.000Z",
    checks: [
      { label: "a", status: "done", containsEnv: undefined, value: "a" },
      { label: "b", status: "error", containsEnv: true, value: "[error] Error: boom" },
    ],
  });
  assert.deepEqual(updates.map((u) => u.map((c) => c.status).join(",")), ["pending,pending", "running,pending", "done,pending", "done,running", "done,error"]);
});

test("shortHash is the first 4 bytes of SHA-256", async () => {
  // sha256("secret") = 2bb80d53…
  assert.equal(await shortHash("secret"), "2bb80d53");
});

test("redactEnv hashes values outside the allowlist and drops their continuation lines", async () => {
  const text = ["PATH=/usr/bin", "GITHUB_TOKEN=secret", "continued line of the token", "HOME=/Users/ada", "not an assignment"].join("\n");
  assert.equal(await redactEnv(text), ["PATH=/usr/bin", "GITHUB_TOKEN=<hash:2bb80d53>", "HOME=/Users/ada", "not an assignment"].join("\n"));
});

test("the report is Markdown with one section per check, redacting only env checks", async () => {
  const report = {
    generatedAt: "2026-11-06T10:00:00.000Z",
    checks: [
      { label: "env", status: "done" as const, containsEnv: true, value: "TOKEN=secret" },
      { label: "plain", status: "done" as const, value: "TOKEN=secret" },
      { label: "empty", status: "done" as const, value: "" },
      { label: "bad", status: "error" as const, value: "[error] timed out" },
    ],
  };
  assert.equal(
    await reportMarkdown(report, true),
    [
      "# OpenConductor Environment Diagnostics Report",
      "(redacted — non-allowlisted env values replaced with hashes)",
      "Generated: 2026-11-06T10:00:00.000Z",
      "",
      "## env", "TOKEN=<hash:2bb80d53>", "",
      "## plain", "TOKEN=secret", "",
      "## empty", "[no output]", "",
      "## bad", "[error] timed out", "",
    ].join("\n"),
  );
  assert.match(await reportMarkdown(report, false), /## env\nTOKEN=secret\n/);
});

test("progress counts done and error rows and rounds the percent", () => {
  const rows = (s: CheckResult["status"][]) => s.map((status, i) => ({ label: String(i), status }));
  assert.deepEqual(progress([]), { finished: 0, total: 0, percent: 0 });
  assert.deepEqual(progress(rows(["done", "error", "running"])), { finished: 2, total: 3, percent: 67 });
});

test("commands run in zsh without rc files, falling back to sh", () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
  assert.equal(zshNoRcs("echo $HOME"), `if [ -x /bin/zsh ]; then exec /bin/zsh -f -c 'echo $HOME'; else exec /bin/sh -c 'echo $HOME'; fi`);
});

test("shellResult trims stdout and reports failures like Conductor", () => {
  assert.equal(shellResult({ stdout: " arm64\n", stderr: "", exitCode: 0 }), "arm64");
  assert.equal(shellResult({ stdout: "", stderr: "nope\n", exitCode: 1 }), "[error] nope");
  assert.equal(shellResult({ stdout: "", stderr: "", exitCode: 2 }), "[error] exit code 2");
  assert.equal(shellResult({ stdout: "", stderr: "", exitCode: null }), "[error] exit code null");
});
