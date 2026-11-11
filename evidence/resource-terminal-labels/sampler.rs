#[path = "../../src-tauri/src/resource_usage/mod.rs"]
mod resource_usage;
use std::collections::HashMap;
use std::io::{self, Read};
use resource_usage::{build, PsRow, Sample};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let data: serde_json::Value = serde_json::from_str(&input).unwrap();
    let labels: HashMap<String, String> = serde_json::from_value(data["labels"].clone()).unwrap();
    let terminals: Vec<(String, u32)> = serde_json::from_value(data["terminals"].clone()).unwrap();
    let mut rows = vec![PsRow { ppid: 1, pid: 500, cpu_percent: 0.0, rss_kb: 2048, comm: "OpenConductor".into() }];
    rows.extend(terminals.iter().map(|(_, pid)| PsRow { ppid: 500, pid: *pid, cpu_percent: 0.0, rss_kb: 1024, comm: "/bin/zsh".into() }));
    let args = HashMap::new();
    let cwds = HashMap::new();
    let snapshot = build(&Sample { rows: &rows, root: 500, args: &args, cwds: &cwds, terminals: &terminals, terminal_labels: &labels, footprint_kb: &|_| None });
    println!("{}", serde_json::to_string(&snapshot).unwrap());
}
