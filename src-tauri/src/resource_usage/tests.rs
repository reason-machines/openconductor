use std::collections::HashMap;

use super::*;

const PS: &str =
    "    1   500   2.5  204800 /Applications/OpenConductor.app/Contents/MacOS/openconductor
  500   510   0.0   10240 /bin/zsh
  510   511  12.0  512000 /opt/homebrew/bin/node
  500   520   1.5   30720 /Users/me/Library/Application Support/OpenConductor/bin/claude
  520   521   0.5    2048 git
    1   900  50.0  999999 /usr/sbin/unrelated
";

fn no_footprint(_: u32) -> Option<u64> {
    None
}

#[test]
fn ps_rows_keep_spaces_in_the_executable_path() {
    let rows = parse_ps_rows(PS);
    assert_eq!(rows.len(), 6);
    assert_eq!(
        rows[0],
        PsRow {
            ppid: 1,
            pid: 500,
            cpu_percent: 2.5,
            rss_kb: 204800,
            comm: "/Applications/OpenConductor.app/Contents/MacOS/openconductor".into(),
        }
    );
    assert_eq!(
        rows[3].comm,
        "/Users/me/Library/Application Support/OpenConductor/bin/claude"
    );
}

#[test]
fn ps_rows_read_a_comma_decimal_and_skip_garbage() {
    let rows = parse_ps_rows("  1  2  3,5  100 x\nnot a row\n");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].cpu_percent, 3.5);
}

#[test]
fn args_and_lsof_parse() {
    let args = parse_args("  500 /Applications/OpenConductor.app/Contents/MacOS/openconductor\n  511 node server.js --port=3000\n");
    assert_eq!(args[&511], "node server.js --port=3000");
    let cwds =
        parse_lsof_cwd("p510\nfcwd\nn/Users/me/ws/lisbon\np511\nfcwd\nn/Users/me/ws/lisbon/app\n");
    assert_eq!(cwds[&510], "/Users/me/ws/lisbon");
    assert_eq!(cwds[&511], "/Users/me/ws/lisbon/app");
}

#[test]
fn subtree_is_the_root_and_its_descendants_only() {
    let rows = parse_ps_rows(PS);
    assert_eq!(subtree(&rows, 500), vec![500, 510, 520, 511, 521]);
    assert_eq!(subtree(&rows, 510), vec![510, 511]);
    assert!(subtree(&rows, 4242).is_empty());
}

#[test]
fn values_after_equals_signs_are_redacted() {
    assert_eq!(
        redact_command("node server.js --token=abc API_KEY=xyz --flag= plain"),
        "node server.js --token=<redacted> API_KEY=<redacted> --flag= plain"
    );
}

#[test]
fn snapshot_labels_terminals_and_sums_totals() {
    let rows = parse_ps_rows(PS);
    let args = parse_args("511 node dev.js SECRET=hunter2\n");
    let cwds = parse_lsof_cwd("p510\nfcwd\nn/Users/me/ws/lisbon\n");
    let terminals = vec![("pty-1".to_string(), 510)];
    let labels = HashMap::from([("pty-1".to_string(), "Terminal 1".to_string())]);
    let usage = build(&Sample {
        rows: &rows,
        root: 500,
        args: &args,
        cwds: &cwds,
        terminals: &terminals,
        terminal_labels: &labels,
        footprint_kb: &no_footprint,
    });
    let pids: Vec<u32> = usage.processes.iter().map(|p| p.pid).collect();
    assert_eq!(
        pids,
        vec![500, 510, 520, 511, 521],
        "unrelated pid 900 is left out"
    );
    let p = |pid: u32| usage.processes.iter().find(|p| p.pid == pid).unwrap();
    assert_eq!(p(500).label, APP_LABEL);
    assert_eq!(p(500).terminal_id, None);
    assert_eq!(p(510).label, "Terminal 1");
    assert_eq!(p(510).terminal_id.as_deref(), Some("pty-1"));
    assert_eq!(p(510).cwd.as_deref(), Some("/Users/me/ws/lisbon"));
    assert_eq!(
        p(511).terminal_id.as_deref(),
        Some("pty-1"),
        "a terminal's children carry its id"
    );
    assert_eq!(p(511).label, "node");
    assert_eq!(p(511).command, "node dev.js SECRET=<redacted>");
    assert_eq!(p(511).copy_command, "node dev.js SECRET=hunter2");
    assert_eq!(p(520).label, "claude");
    assert_eq!(p(521).command, "git", "no args line falls back to comm");
    assert_eq!(
        usage.total_memory_kb,
        204800 + 10240 + 512000 + 30720 + 2048
    );
    assert!((usage.total_cpu_percent - 16.5).abs() < 1e-9);
}

#[test]
fn footprint_wins_over_rss_when_available() {
    let rows = parse_ps_rows(PS);
    let none = HashMap::new();
    let footprint = |pid: u32| (pid == 500).then_some(1234);
    let usage = build(&Sample {
        rows: &rows,
        root: 500,
        args: &none,
        cwds: &HashMap::new(),
        terminals: &[],
        terminal_labels: &HashMap::new(),
        footprint_kb: &footprint,
    });
    assert_eq!(usage.processes[0].memory_kb, 1234);
    assert_eq!(usage.processes[1].memory_kb, 10240);
}

#[test]
fn serializes_with_the_reference_keys() {
    let usage = ResourceUsage {
        total_cpu_percent: 1.0,
        total_memory_kb: 2,
        processes: vec![ProcessUsage {
            pid: 3,
            ppid: 1,
            label: "x".into(),
            command: "x".into(),
            copy_command: "x".into(),
            cpu_percent: 1.0,
            memory_kb: 2,
            terminal_id: Some("t".into()),
            cwd: None,
        }],
    };
    let v = serde_json::to_value(&usage).unwrap();
    assert_eq!(
        v,
        serde_json::json!({
            "totalCpuPercent": 1.0,
            "totalMemoryKb": 2,
            "processes": [{
                "pid": 3, "ppid": 1, "label": "x", "command": "x", "copyCommand": "x",
                "cpuPercent": 1.0, "memoryKb": 2, "terminalId": "t"
            }]
        })
    );
}

/// The live sampler on this machine: this test process is the root.
#[test]
fn collect_samples_this_process() {
    let usage = collect(std::process::id(), &[], &HashMap::new()).expect("ps runs");
    assert_eq!(
        usage.processes.first().map(|p| p.pid),
        Some(std::process::id())
    );
    assert_eq!(usage.processes[0].label, APP_LABEL);
    assert!(usage.processes[0].memory_kb > 0);
}
