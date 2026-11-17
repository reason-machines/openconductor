#!/usr/bin/env python3
"""Synthetic local Git + Rust unit harness; no app/provider/native execution.

Uses actual WorkspaceService, command/skill scanners and response DTOs. Tauri's
attribute/AppHandle/path/state/spawn edge is signature-stubbed and exercised;
this is not a full Tauri IPC or macOS compilation. Generated crate/targets live
outside the checkout, and are removed at exit. No package/workflow dispatch.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "src-tauri/src"
with tempfile.TemporaryDirectory(prefix="oc-ref-tests-") as tmp:
    out = Path(tmp)
    (out / "macros").mkdir()
    (out / "tauri").mkdir()
    (out / "Cargo.toml").write_text('''[package]
name="pre-workspace-harness"
version="0.0.0"
edition="2021"
[lib]
path="lib.rs"
[dependencies]
serde={version="1",features=["derive"]}
serde_json="1"
sha2="0.10"
libc="0.2"
uuid={version="1",features=["v4"]}
tokio={version="1",features=["rt-multi-thread","macros"]}
tauri={path="tauri"}
[lints.rust]
unexpected_cfgs={level="warn",check-cfg=['cfg(workspace_std_only)']}
[workspace]
''')
    (out / "macros/Cargo.toml").write_text('''[package]
name="completion-macros"
version="0.0.0"
edition="2021"
[lib]
proc-macro=true
path="lib.rs"
''')
    (out / "macros/lib.rs").write_text('''use proc_macro::TokenStream;
#[proc_macro_attribute]
pub fn command(_: TokenStream, item: TokenStream) -> TokenStream { item }
''')
    (out / "tauri/Cargo.toml").write_text('''[package]
name="tauri"
version="0.0.0"
edition="2021"
[lib]
path="lib.rs"
[dependencies]
completion-macros={path="../macros"}
tokio={version="1",features=["rt"]}
''')
    (out / "tauri/lib.rs").write_text('''pub use completion_macros::command;
#[derive(Clone)]
pub struct AppHandle { pub service: std::sync::Arc<dyn std::any::Any + Send + Sync>, pub cache: std::path::PathBuf }
pub struct State<'a,T>(&'a T);
impl<T> std::ops::Deref for State<'_,T> { type Target=T; fn deref(&self)->&T { self.0 } }
pub trait Manager {
 fn path(&self)->&Self;
 fn state<T: Send+Sync+'static>(&self)->State<'_,T>;
}
impl Manager for AppHandle {
 fn path(&self)->&Self { self }
 fn state<T:Send+Sync+'static>(&self)->State<'_,T> { State(self.service.downcast_ref().unwrap()) }
}
impl AppHandle {
 pub fn app_cache_dir(&self)->Result<std::path::PathBuf,std::io::Error> { Ok(self.cache.clone()) }
}
pub mod async_runtime { pub use tokio::task::spawn_blocking; }
''')
    # Mount real production modules. Do not compile/execute their provider or
    # CLI query paths. codex_commands is a pure constructor extracted verbatim.
    commands = (SRC / "agent_commands/mod.rs").read_text()
    codex = re.search(r"pub fn codex_commands\(\).*?\n}\n", commands, re.S).group()
    suffix = (SRC / "sidecar_stores/mod.rs").read_text().split("fn temp_suffix() -> String", 1)[1]
    rpc = (SRC / "agent/codex_rpc.rs").read_text()
    skill_links = rpc[rpc.index("pub fn skill_links("):rpc.index("pub fn initialized_line(")]
    lib = f'''{skill_links}
#[path="{SRC}/workspace/mod.rs"] pub mod workspace;
#[path="{SRC}/pre_workspace_completions.rs"] pub mod pre_workspace_completions;
pub mod sidecar_stores {{
 fn temp_suffix() -> String {suffix}
 #[path="{SRC}/sidecar_stores/time.rs"] pub mod time;
 #[path="{SRC}/sidecar_stores/completions.rs"] pub mod completions;
}}
pub mod agent_commands {{
 use crate::sidecar_stores::completions::SlashCommand;
 #[path="{SRC}/agent_commands/scan.rs"] pub mod scan;
 {codex}
}}
'''
    (out / "lib.rs").write_text(lib)
    env = dict(os.environ)
    env["RUSTFLAGS"] = env.get("RUSTFLAGS", "") + " --cfg workspace_std_only"
    subprocess.run(["cargo", "test", "--manifest-path", str(out / "Cargo.toml"),
                    "pre_workspace_completions::", "--", "--test-threads=2"], env=env, check=True, cwd=ROOT)
    subprocess.run(["cargo", "clippy", "--manifest-path", str(out / "Cargo.toml"),
                    "--all-targets", "--", "-D", "warnings"], env=env, check=True, cwd=ROOT)
print("PASS: actual selected-ref adapter/scanners/service + signature-stubbed IPC edge; clippy")
