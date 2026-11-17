"""Typecheck and execute the exact changed blocking-command envelope with pure DTOs.

This checks Result/JoinError propagation, one capture, cleanup and checkpoint/handoff
ordering. It is not Tauri, SQLite, filesystem, binary download or provider integration.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path.cwd()
commands = (root / 'src-tauri/src/claude_chat/commands.rs').read_text()
a = commands.index('    let (end, changes) = tauri::async_runtime::spawn_blocking(move || {')
b = commands.index('    let mut out = wire::turn_end_json(&end);', a)
body = commands[a:b]
source = r'''
use std::path::{Path, PathBuf};
use std::sync::{Arc, atomic::{AtomicBool, AtomicUsize, Ordering}};
#[derive(Clone, Copy)] enum Agent { Claude }
mod agent_launch {
    use super::*;
    thread_local! { pub static READS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
                   pub static FAIL: std::cell::Cell<bool> = const { std::cell::Cell::new(false) }; }
    pub fn launch(_: &(), _: Agent) -> Result<PathBuf, String> {
        READS.with(|n| n.set(n.get() + 1));
        if FAIL.with(std::cell::Cell::get) { Err("synthetic resolution failure".into()) }
        else { Ok("/synthetic/resolved".into()) }
    }
}
mod tauri { pub mod async_runtime {
    #[derive(Debug)] pub struct JoinError;
    impl std::fmt::Display for JoinError { fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "synthetic join error") } }
    pub async fn spawn_blocking<T>(f: impl FnOnce() -> T) -> Result<T, JoinError> { Ok(f()) }
} }
#[derive(Default)] struct ChatOptions { executable_path: Option<PathBuf> }
#[derive(Default)] struct Runner { expected: AtomicBool, abandoned: AtomicUsize, prompts: AtomicUsize }
impl Runner {
    fn abandon_prompt(&self, _: &str) { self.expected.store(false, Ordering::SeqCst); self.abandoned.fetch_add(1, Ordering::SeqCst); }
    fn prompt_with_handoff(&self, _: &str, _: &str, _: &[PathBuf], options: &ChatOptions,
                           on_handoff: Option<Box<dyn FnOnce() + Send>>) -> PathBuf {
        self.expected.store(false, Ordering::SeqCst); self.prompts.fetch_add(1, Ordering::SeqCst);
        if let Some(f) = on_handoff { f(); }
        options.executable_path.clone().expect("server captured a resolved path")
    }
}
struct TurnArg { session_id: String, turn_id: String }
struct TurnTarget<'a> { workspace: &'a Path, session_id: &'a str, turn_id: &'a str }
thread_local! { static CHECKPOINTS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }
fn around_turn<T>(target: Option<TurnTarget<'_>>, f: impl FnOnce() -> T) -> (T, Option<()>) {
    if let Some(t) = &target { assert_eq!(t.workspace, Path::new("/synthetic/workspace"));
        assert_eq!(t.session_id, "session"); assert_eq!(t.turn_id, "turn");
        CHECKPOINTS.with(|n| n.set(n.get() + 1)); }
    (f(), target.map(|_| ()))
}
struct Channel(Arc<AtomicUsize>);
impl Channel { fn send(&self, _: ()) -> Result<(), ()> { self.0.fetch_add(1, Ordering::SeqCst); Ok(()) } }
async fn command(runner: Arc<Runner>, turn: Option<TurnArg>, handoffs: Arc<AtomicUsize>) -> Result<(PathBuf, Option<()>), String> {
    let app = (); let chat_id = "chat".to_owned(); let text = "synthetic".to_owned();
    let cwd = Some(PathBuf::from("/synthetic/workspace")); let directories = vec![];
    let mut options = ChatOptions::default(); let on_handoff = Channel(handoffs);
    /* COMMAND */
    Ok((end, changes))
}
fn run<T>(future: impl std::future::Future<Output=T>) -> T {
    let mut f = std::pin::pin!(future); let w = std::task::Waker::noop();
    let mut c = std::task::Context::from_waker(w);
    match std::future::Future::poll(f.as_mut(), &mut c) { std::task::Poll::Ready(x) => x, _ => panic!("pure envelope cannot wait") }
}
#[test] fn successful_capture_forwards_once_and_preserves_checkpoint_handoff() {
    for checkpoint in [false, true] {
        agent_launch::FAIL.with(|n| n.set(false)); agent_launch::READS.with(|n| n.set(0)); CHECKPOINTS.with(|n| n.set(0));
        let runner = Arc::new(Runner::default()); runner.expected.store(true, Ordering::SeqCst);
        let handoffs = Arc::new(AtomicUsize::new(0));
        let turn = checkpoint.then(|| TurnArg { session_id: "session".into(), turn_id: "turn".into() });
        let result = run(command(runner.clone(), turn, handoffs.clone())).unwrap();
        assert_eq!(result, (PathBuf::from("/synthetic/resolved"), checkpoint.then_some(())));
        assert_eq!(agent_launch::READS.with(std::cell::Cell::get), 1);
        assert_eq!(runner.prompts.load(Ordering::SeqCst), 1); assert_eq!(runner.abandoned.load(Ordering::SeqCst), 0);
        assert!(!runner.expected.load(Ordering::SeqCst)); assert_eq!(handoffs.load(Ordering::SeqCst), 1);
        assert_eq!(CHECKPOINTS.with(std::cell::Cell::get), usize::from(checkpoint));
    }
}
#[test] fn resolution_failure_abandons_expected_prompt_without_checkpoint_or_handoff() {
    agent_launch::FAIL.with(|n| n.set(true)); agent_launch::READS.with(|n| n.set(0)); CHECKPOINTS.with(|n| n.set(0));
    let runner = Arc::new(Runner::default()); runner.expected.store(true, Ordering::SeqCst);
    let handoffs = Arc::new(AtomicUsize::new(0));
    let turn = Some(TurnArg { session_id: "session".into(), turn_id: "turn".into() });
    assert_eq!(run(command(runner.clone(), turn, handoffs.clone())), Err("synthetic resolution failure".into()));
    assert_eq!(agent_launch::READS.with(std::cell::Cell::get), 1); assert_eq!(runner.abandoned.load(Ordering::SeqCst), 1);
    assert!(!runner.expected.load(Ordering::SeqCst)); assert_eq!(runner.prompts.load(Ordering::SeqCst), 0);
    assert_eq!(handoffs.load(Ordering::SeqCst), 0); assert_eq!(CHECKPOINTS.with(std::cell::Cell::get), 0);
}
'''.replace('/* COMMAND */', body)
work = root / '.oc-tmp/executable-command'
work.mkdir(parents=True, exist_ok=True)
(work / 'command.rs').write_text(source)
meta = {'command_envelope_sha256': hashlib.sha256(body.encode()).hexdigest(),
        'commands_sha256': hashlib.sha256(commands.encode()).hexdigest(),
        'adapters': ['ready-only async_runtime shim', 'counter-only runner, checkpoint and handoff', 'fake resolver path/error'],
        'exact_changed_envelope': True}
(work / 'source.json').write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps(meta), flush=True)
result = subprocess.run(['rustc', '--edition=2021', '--test', str(work / 'command.rs'), '-o', str(work / 'command-test')])
if result.returncode: sys.exit(result.returncode)
sys.exit(subprocess.run([str(work / 'command-test'), '--nocapture', '--test-threads=1']).returncode)
