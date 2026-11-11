import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";

const execute = promisify(execFile);

export async function buildRustBridge(repoRoot, directory) {
  await mkdir(directory, { recursive: true });
  const module = (name) => JSON.stringify(join(repoRoot, "src-tauri/src/reason_acp", `${name}.rs`));
  await writeFile(join(directory, "Cargo.toml"), `[package]\nname = "reason-pairing-e2e-bridge"\nversion = "0.0.0"\nedition = "2021"\npublish = false\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n[workspace]\n`);
  await mkdir(join(directory, "src"), { recursive: true });
  await writeFile(join(directory, "src/main.rs"), `
#[path = ${module("cli")}] mod cli;
#[path = ${module("account")}] mod account;
#[path = ${module("login")}] mod login;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::time::Duration;
use serde_json::{json, Value};
fn main() {
    let timeout_ms: u64 = std::env::var("OC_PAIRING_FIXTURE_TIMEOUT_MS").unwrap().parse().unwrap();
    let service = login::LoginService::with_options(login::LoginOptions {
        startup_timeout: Duration::from_millis(timeout_ms),
        status_timeout: Duration::from_secs(3),
        timeout: Duration::from_millis(timeout_ms),
        poll_interval: Duration::from_millis(80),
        allow_loopback: true,
    });
    let dir = PathBuf::from(std::env::var("HOME").expect("isolated fixture HOME"));
    let launch = cli::LaunchConfig::new(std::env::var("OC_PAIRING_FIXTURE_EXE").expect("fixture executable")).unwrap();
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let request: Value = serde_json::from_str(&line).unwrap();
        let result: Result<Value, String> = (|| {
            Ok(match request["command"].as_str().unwrap_or("") {
                "reason_login_start" => {
                    let configured = launch.in_workspace(request["args"]["workspace"].as_str()).map_err(|e| e.to_string())?;
                    serde_json::to_value(service.start(configured, dir.clone())).unwrap()
                },
                "reason_login_status" => serde_json::to_value(service.refresh(&launch, &dir)?).unwrap(),
                "reason_login_cancel" => serde_json::to_value(service.cancel(request["args"]["attemptId"].as_str().unwrap_or(""))).unwrap(),
                "reason_account_status" => serde_json::to_value(launch.account(&dir).ok_or("Fixture status did not answer")?).unwrap(),
                _ => return Err("Unsupported pairing fixture IPC".into()),
            })
        })();
        let reply = match result { Ok(value) => json!({"id":request["id"], "value":value}), Err(error) => json!({"id":request["id"], "error":error}) };
        println!("{}", reply);
        io::stdout().flush().unwrap();
    }
}
`);
  try {
    await execute("cargo", ["build", "--quiet", "--manifest-path", join(directory, "Cargo.toml")], { cwd: repoRoot, timeout: 180_000, maxBuffer: 2_000_000 });
  } catch (error) {
    throw new Error(`Failed to compile production Rust pairing bridge:\n${error.stderr || error.message}`);
  }
  return join(directory, "target/debug/reason-pairing-e2e-bridge");
}

export function startRustBridge(binary, { home, origin, client, executable, loginDelayMs = 0, timeoutMs = 15_000 }) {
  const child = spawn(binary, [], {
    env: { PATH: process.env.PATH, HOME: home, OC_PAIRING_FIXTURE_ORIGIN: origin, OC_PAIRING_FIXTURE_CLIENT: client, OC_PAIRING_FIXTURE_EXE: executable, OC_PAIRING_FIXTURE_LOGIN_DELAY_MS: String(loginDelayMs), OC_PAIRING_FIXTURE_TIMEOUT_MS: String(timeoutMs) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let nextId = 0;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8192); });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const reply = JSON.parse(line);
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    clearTimeout(waiting.timer);
    if (reply.error) waiting.reject(new Error(reply.error));
    else waiting.resolve(reply.value);
  });
  const fail = (error) => {
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(error); }
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", (code, signal) => fail(new Error(`Rust bridge exited ${code ?? signal}: ${stderr}`)));
  return {
    diagnostics() {
      let finisher = { available: false };
      try {
        const file = openSync(join(home, "pairing-finisher.stderr"), "r");
        try {
          const size = fstatSync(file).size;
          const tail = Buffer.alloc(Math.min(size, 8192));
          const count = readSync(file, tail, 0, tail.length, Math.max(0, size - tail.length));
          const lines = tail.subarray(0, count).toString("utf8").split("\n").filter(Boolean);
          const safe = lines.filter((line) => /^fixture-finisher (?:http status=[1-5]\d\d|transport|decode|unexpected)$/.test(line));
          finisher = { available: true, bytes: size, truncated: size > tail.length, lines: safe.slice(-20), redactedLines: lines.length - safe.length };
        } finally { closeSync(file); }
      } catch {}
      return { bridge: { exitCode: child.exitCode, signal: child.signalCode, retainedBytes: Buffer.byteLength(stderr), panic: stderr.includes("panicked at"), redacted: Boolean(stderr) }, finisher };
    },
    invoke(command, args = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Rust bridge IPC timed out: ${command}`)); }, 10_000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, command, args }) + "\n");
      });
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        const state = await this.invoke("reason_login_status");
        if (state.attemptId) await this.invoke("reason_login_cancel", { attemptId: state.attemptId });
        const exited = once(child, "exit");
        child.stdin.end();
        const kill = setTimeout(() => child.kill("SIGKILL"), 2000);
        try { await exited; } finally { clearTimeout(kill); }
      }
      lines.close();
    },
  };
}
