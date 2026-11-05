//! The sidebar's resource usage readout (`get_resource_usage`).
//!
//! Reference: Conductor 0.87.6 `src-tauri/src/resource_usage.rs` (path
//! string in `MacOS/conductor`, found with REA `execute-rizin-command`; see
//! evidence/sidebar-resource-usage/NOTES.md). Its strings show how it
//! samples: `ps -axo ppid=,pid=,%cpu=,rss=,comm=` for the process table,
//! `ps -ww -axo pid=,args=` for command lines, `lsof -a -d cwd -Fn -p
//! <pid,…>` for working directories, and `proc_pid_rusage` for memory with
//! "proc_pid_rusage failed for pid …; falling back to ps rss". Command lines
//! are shown with `=<redacted>` values. The IPC result keys are
//! `totalCpuPercent`, `totalMemoryKb` and `processes[]` of `pid`, `ppid`,
//! `label`, `command`, `copyCommand`, `cpuPercent`, `memoryKb`, `terminalId`,
//! `cwd` (one adjacent string run in the same binary).
//!
//! What is sampled here is the app's own process tree: this process and
//! every descendant (agents, terminals, scripts). Processes under a terminal
//! carry that terminal's id. The exact process selection and label rules of
//! the reference were not decompiled (REA's Ghidra provider times out on the
//! 120 MB binary), so labels are the executable's file name, the root is
//! "OpenConductor", and a terminal's shell takes the label the UI passes.
//!
//! The parsing and tree logic is pure; [`collect`] runs the commands.

/// Built without Tauri for the module's standalone tests
/// (`--cfg resource_usage_std_only`).
#[cfg(not(resource_usage_std_only))]
pub mod commands;

#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet, VecDeque};
use std::process::Command;

use serde::Serialize;

/// One process in the snapshot.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessUsage {
    pub pid: u32,
    pub ppid: u32,
    pub label: String,
    /// The command line with `key=value` values replaced by `<redacted>`.
    pub command: String,
    /// The full command line, for "Copy resource usage".
    pub copy_command: String,
    pub cpu_percent: f64,
    pub memory_kb: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

/// What `get_resource_usage` returns.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUsage {
    pub total_cpu_percent: f64,
    pub total_memory_kb: u64,
    pub processes: Vec<ProcessUsage>,
}

/// One row of `ps -o ppid=,pid=,%cpu=,rss=,comm=`.
#[derive(Debug, Clone, PartialEq)]
pub struct PsRow {
    pub ppid: u32,
    pub pid: u32,
    pub cpu_percent: f64,
    pub rss_kb: u64,
    pub comm: String,
}

/// The label the app's own process gets.
pub const APP_LABEL: &str = "OpenConductor";

/// Parse `ps -o ppid=,pid=,%cpu=,rss=,comm=`. `comm` may contain spaces (a
/// macOS executable path), so it is the rest of the line. Unparsable lines
/// are skipped.
pub fn parse_ps_rows(out: &str) -> Vec<PsRow> {
    out.lines()
        .filter_map(|line| {
            let mut it = line.split_whitespace();
            let ppid = it.next()?.parse().ok()?;
            let pid = it.next()?.parse().ok()?;
            let cpu_percent = it.next()?.replace(',', ".").parse().ok()?;
            let rss_kb = it.next()?.parse().ok()?;
            // Everything after the fourth field, spaces kept.
            let rest = line.trim_start();
            let comm = (0..4)
                .try_fold(rest, |s, _| {
                    let s = s.trim_start();
                    s.find(char::is_whitespace).map(|i| &s[i..])
                })
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            Some(PsRow {
                ppid,
                pid,
                cpu_percent,
                rss_kb,
                comm,
            })
        })
        .collect()
}

/// Parse `ps -ww -o pid=,args=` into pid → command line.
pub fn parse_args(out: &str) -> HashMap<u32, String> {
    out.lines()
        .filter_map(|line| {
            let line = line.trim_start();
            let (pid, args) = line.split_once(char::is_whitespace).unwrap_or((line, ""));
            Some((pid.parse().ok()?, args.trim().to_string()))
        })
        .collect()
}

/// Parse `lsof -a -d cwd -Fn -p …` field output (`p<pid>`, `fcwd`,
/// `n<path>`) into pid → working directory.
pub fn parse_lsof_cwd(out: &str) -> HashMap<u32, String> {
    let mut cwds = HashMap::new();
    let mut pid = None;
    for line in out.lines() {
        match line.split_at_checked(1) {
            Some(("p", rest)) => pid = rest.parse().ok(),
            Some(("n", path)) => {
                if let Some(p) = pid {
                    cwds.insert(p, path.to_string());
                }
            }
            _ => {}
        }
    }
    cwds
}

/// `root` and all its descendants, root first, then breadth first.
pub fn subtree(rows: &[PsRow], root: u32) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for r in rows {
        if r.pid != r.ppid {
            children.entry(r.ppid).or_default().push(r.pid);
        }
    }
    let mut seen = HashSet::new();
    let mut order = Vec::new();
    let mut queue = VecDeque::from([root]);
    while let Some(pid) = queue.pop_front() {
        if !seen.insert(pid) {
            continue;
        }
        if rows.iter().any(|r| r.pid == pid) {
            order.push(pid);
        }
        if let Some(kids) = children.get(&pid) {
            let mut kids = kids.clone();
            kids.sort_unstable();
            queue.extend(kids);
        }
    }
    order
}

/// Replace the value of every `key=value` argument with `<redacted>`, so the
/// popover never shows tokens or secrets passed on a command line.
pub fn redact_command(command: &str) -> String {
    command
        .split(' ')
        .map(|arg| match arg.split_once('=') {
            Some((key, value)) if !value.is_empty() => format!("{key}=<redacted>"),
            _ => arg.to_string(),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The executable's file name from `comm` (macOS gives a full path).
pub fn executable_label(comm: &str) -> String {
    let name = comm.rsplit('/').next().unwrap_or(comm).trim();
    if name.is_empty() {
        comm.trim().to_string()
    } else {
        name.to_string()
    }
}

/// Inputs to [`build`], gathered by [`collect`].
pub struct Sample<'a> {
    pub rows: &'a [PsRow],
    pub root: u32,
    pub args: &'a HashMap<u32, String>,
    pub cwds: &'a HashMap<u32, String>,
    /// Terminal id → its shell's pid.
    pub terminals: &'a [(String, u32)],
    /// Terminal id → the label the UI shows for it ("Terminal 1", …).
    pub terminal_labels: &'a HashMap<String, String>,
    /// Memory in KB from a better source than `ps` rss, when it has one.
    pub footprint_kb: &'a dyn Fn(u32) -> Option<u64>,
}

/// The snapshot of `root`'s process tree.
pub fn build(s: &Sample) -> ResourceUsage {
    let by_pid: HashMap<u32, &PsRow> = s.rows.iter().map(|r| (r.pid, r)).collect();
    let pids = subtree(s.rows, s.root);
    let mut terminal_of: HashMap<u32, &str> = HashMap::new();
    let mut terminal_roots: HashMap<u32, &str> = HashMap::new();
    for (id, shell) in s.terminals {
        terminal_roots.insert(*shell, id);
        for pid in subtree(s.rows, *shell) {
            terminal_of.insert(pid, id);
        }
    }
    let processes: Vec<ProcessUsage> = pids
        .iter()
        .filter_map(|pid| by_pid.get(pid))
        .map(|row| {
            let full = s
                .args
                .get(&row.pid)
                .filter(|a| !a.is_empty())
                .cloned()
                .unwrap_or_else(|| row.comm.clone());
            let label = if row.pid == s.root {
                APP_LABEL.to_string()
            } else if let Some(label) = terminal_roots
                .get(&row.pid)
                .and_then(|id| s.terminal_labels.get(*id))
            {
                label.clone()
            } else {
                executable_label(&row.comm)
            };
            ProcessUsage {
                pid: row.pid,
                ppid: row.ppid,
                label,
                command: redact_command(&full),
                copy_command: full,
                cpu_percent: row.cpu_percent,
                memory_kb: (s.footprint_kb)(row.pid).unwrap_or(row.rss_kb),
                terminal_id: terminal_of.get(&row.pid).map(|id| id.to_string()),
                cwd: s.cwds.get(&row.pid).cloned(),
            }
        })
        .collect();
    ResourceUsage {
        total_cpu_percent: processes.iter().map(|p| p.cpu_percent).sum(),
        total_memory_kb: processes.iter().map(|p| p.memory_kb).sum(),
        processes,
    }
}

fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("{program} could not start: {e}"))?;
    // lsof exits 1 when one of the pids has gone; its output is still good.
    if !out.status.success() && out.stdout.is_empty() {
        return Err(format!(
            "{program} command failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `ps`'s "every process" flags: BSD `-ax` on macOS (as the reference),
/// `-e` for procps.
const PS_ALL: &str = if cfg!(target_os = "macos") {
    "-axo"
} else {
    "-eo"
};

/// The process's physical footprint, which Activity Monitor shows as
/// Memory. `None` falls back to `ps` rss, as the reference does.
#[cfg(target_os = "macos")]
fn phys_footprint_kb(pid: u32) -> Option<u64> {
    // SAFETY: `info` is a plain-integer struct that proc_pid_rusage fills
    // for flavor RUSAGE_INFO_V4; the pointer cast is the C API's.
    unsafe {
        let mut info: libc::rusage_info_v4 = std::mem::zeroed();
        let rc = libc::proc_pid_rusage(
            pid as libc::c_int,
            libc::RUSAGE_INFO_V4,
            &mut info as *mut libc::rusage_info_v4 as *mut libc::rusage_info_t,
        );
        if rc == 0 {
            Some(info.ri_phys_footprint / 1024)
        } else {
            eprintln!("proc_pid_rusage failed for pid {pid}; falling back to ps rss");
            None
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn phys_footprint_kb(_pid: u32) -> Option<u64> {
    None
}

/// Sample this app's process tree. `terminals` is every open terminal's id
/// and shell pid.
pub fn collect(
    root: u32,
    terminals: &[(String, u32)],
    terminal_labels: &HashMap<String, String>,
) -> Result<ResourceUsage, String> {
    let rows = parse_ps_rows(&run("ps", &[PS_ALL, "ppid=,pid=,%cpu=,rss=,comm="])?);
    let pids = subtree(&rows, root);
    let args = parse_args(&run("ps", &["-ww", PS_ALL, "pid=,args="])?);
    let pid_list = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    // A missing lsof only costs the workspace grouping by directory.
    let cwds = run("lsof", &["-a", "-d", "cwd", "-Fn", "-p", &pid_list])
        .map(|out| parse_lsof_cwd(&out))
        .unwrap_or_default();
    Ok(build(&Sample {
        rows: &rows,
        root,
        args: &args,
        cwds: &cwds,
        terminals,
        terminal_labels,
        footprint_kb: &phys_footprint_kb,
    }))
}
