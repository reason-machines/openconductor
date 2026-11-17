//! Frozen actual-boundary fixture. No filesystem, DB, CLI, app, shell or provider.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde_json::Value;
#[derive(Clone, Copy, Debug)]
enum Agent { Claude }
impl std::fmt::Display for Agent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "claude") }
}
mod agent {
    use std::fmt;
    /* SECRET_STRING */
}
mod agent_launch {
    use super::*;
    #[derive(Debug)] enum Source { Custom, Bundled, System }
    #[derive(Debug)] struct Resolved { path: PathBuf, source: Source }
    fn display_name(_: Agent) -> &'static str { "Claude Code" }
    /* RESOLVE */
    thread_local! {
        static CUSTOM: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
        static READS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }
    pub fn set(custom: Option<&str>) { CUSTOM.with(|v| *v.borrow_mut() = custom.map(str::to_owned)); }
    pub fn reads() -> usize { READS.with(std::cell::Cell::get) }
    pub fn launch(_: &(), agent: Agent) -> Result<PathBuf, String> {
        READS.with(|n| n.set(n.get() + 1));
        CUSTOM.with(|v| resolve(agent, v.borrow().as_deref(), || Ok("/synthetic/bundled/claude".into()), || None).map(|r| r.path))
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
pub enum PermissionMode { Default, Plan, Auto, BypassPermissions }
#[derive(Debug, Default)]
pub struct Env(BTreeMap<String, agent::SecretString>);
impl Env {
    fn set_secret(&mut self, key: &str, value: agent::SecretString) { self.0.insert(key.to_owned(), value); }
    fn value(&self, key: &str) -> Option<&str> { self.0.get(key).map(agent::SecretString::expose) }
}
#[derive(Debug)]
pub struct ClaudeLaunch {
    pub executable: PathBuf, pub chrome: bool, pub model: Option<String>, pub effort: Option<String>,
    pub settings: Option<Value>, pub permission_mode: PermissionMode,
    pub add_dirs: Vec<PathBuf>, pub resume: Option<String>, pub env: Env,
}
/* OPTIONS */
struct Mapper(Option<String>);
impl Mapper { fn session_id(&self) -> Option<&str> { self.0.as_deref() } }
#[derive(Default)] struct ProbeSession { kills: usize, waits: usize }
impl ProbeSession {
    fn kill(&mut self) -> Result<(), String> { self.kills += 1; Ok(()) }
    fn wait(&mut self) -> Result<(), String> { self.waits += 1; Ok(()) }
}
struct TurnState { alive: bool, waiting: Vec<()>, mapper: Mapper }
struct Live { directories: Vec<PathBuf>, options: ChatOptions, session: Arc<Mutex<ProbeSession>>, state: Arc<Mutex<TurnState>> }
struct Chat { cwd: PathBuf, resume: Option<String>, live: Option<Live> }
type Launcher = Box<dyn Fn(&Path, Option<String>) -> Result<ClaudeLaunch, String>>;
struct ProbeRunner { launcher: Launcher }
impl ProbeRunner {
    fn abandon_prompt(&self, _: &str) {}
/* ENSURE_LIVE_PREFIX */
}
fn launch(_: &Path, resume: Option<String>) -> Result<ClaudeLaunch, String> {
    let settings_app = ();
    /* LAUNCHER_RESOLVE */
    let mut launch = ClaudeLaunch { executable: "/synthetic/launcher-fallback".into(), chrome: false,
        model: None, effort: None, settings: None, permission_mode: PermissionMode::Default,
        add_dirs: vec![], resume, env: Env::default() };
    /* LAUNCHER_APPLY */
    Ok(launch)
}
fn runner() -> ProbeRunner { ProbeRunner { launcher: Box::new(launch) } }
fn options_for_turn(custom: Option<&str>) -> ChatOptions {
    agent_launch::set(custom);
    fn capture() -> Result<ChatOptions, String> {
        let app = (); let runner = self::runner(); let chat_id = "chat";
        let mut options = ChatOptions::default();
        /* COMMAND_CAPTURE */
        Ok(options)
    }
    capture().unwrap()
}
fn chat(custom: Option<&str>, busy: bool, alive: bool) -> (Chat, Arc<Mutex<ProbeSession>>) {
    let options = options_for_turn(custom);
    let session = Arc::new(Mutex::new(ProbeSession::default()));
    (Chat { cwd: "/synthetic/workspace".into(), resume: Some("saved".into()), live: Some(Live {
        directories: vec![], options, session: session.clone(), state: Arc::new(Mutex::new(TurnState {
            alive, waiting: if busy { vec![()] } else { vec![] }, mapper: Mapper(Some("observed".into())),
        })),
    }) }, session)
}
fn changed_idle(before: Option<&str>, after: Option<&str>, expected: &str) {
    let (mut chat, session) = chat(before, false, true);
    let options = options_for_turn(after);
    let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap()
        .expect("changed resolved executable must recreate the idle generator");
    assert_eq!(launch.executable, PathBuf::from(expected));
    assert_eq!(launch.resume.as_deref(), Some("observed"));
    let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (1, 1));
}
#[test] fn custom_executable_added_recreates_idle() { changed_idle(None, Some("/synthetic/custom/a"), "/synthetic/custom/a"); }
#[test] fn custom_executable_changed_recreates_idle() { changed_idle(Some("/synthetic/custom/a"), Some("/synthetic/custom/b"), "/synthetic/custom/b"); }
#[test] fn reset_to_bundled_recreates_idle() { changed_idle(Some("/synthetic/custom/a"), None, "/synthetic/bundled/claude"); }
#[test]
fn unchanged_resolved_path_reuses_idle_and_busy() {
    for busy in [false, true] { for path in [None, Some("/synthetic/custom/a")] {
        let (mut chat, session) = chat(path, busy, true);
        let options = options_for_turn(path);
        assert!(runner().ensure_live("chat", &mut chat, &[], &options).unwrap().is_none());
        let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0));
    } }
}
#[test]
fn trim_blank_and_same_resolved_bundled_path_do_not_restart() {
    for (before, after) in [(None, Some("  ")), (None, Some("/synthetic/bundled/claude")),
                            (Some("/synthetic/custom/a"), Some(" /synthetic/custom/a "))] {
        let (mut chat, session) = chat(before, false, true);
        let options = options_for_turn(after);
        assert!(runner().ensure_live("chat", &mut chat, &[], &options).unwrap().is_none());
        let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0));
    }
}
#[test]
fn changed_busy_defers_without_kill_and_retries_at_idle() {
    let (mut chat, session) = chat(Some("/synthetic/custom/a"), true, true);
    let options = options_for_turn(Some("/synthetic/custom/b"));
    assert!(runner().ensure_live("chat", &mut chat, &[], &options).is_err());
    { let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0)); }
    assert_eq!(chat.resume.as_deref(), Some("saved"));
    chat.live.as_ref().unwrap().state.lock().unwrap().waiting.clear();
    let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap().unwrap();
    assert_eq!(launch.executable, PathBuf::from("/synthetic/custom/b"));
    assert_eq!(launch.resume.as_deref(), Some("observed"));
}
#[test]
fn first_and_dead_launch_use_current_executable_with_resume_identity() {
    for dead in [false, true] {
        let (mut chat, _) = chat(Some("/synthetic/custom/a"), false, false);
        if !dead { chat.live = None; }
        let options = options_for_turn(Some("/synthetic/custom/b"));
        let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap().unwrap();
        assert_eq!(launch.executable, PathBuf::from("/synthetic/custom/b"));
        assert_eq!(launch.resume.as_deref(), Some(if dead { "observed" } else { "saved" }));
    }
}
#[test]
fn launch_uses_captured_resolved_path_not_a_second_read() {
    let options = options_for_turn(Some("/synthetic/captured"));
    let reads = agent_launch::reads();
    agent_launch::set(Some("/synthetic/later"));
    let mut chat = Chat { cwd: "/synthetic/workspace".into(), resume: None, live: None };
    let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap().unwrap();
    assert_eq!(launch.executable, PathBuf::from("/synthetic/captured"));
    assert_eq!(agent_launch::reads(), reads, "prepared launch must not resolve executable again");
}
#[test]
fn legacy_unspecified_executable_keeps_launcher_and_adjacent_options() {
    agent_launch::set(None);
    let options = ChatOptions { model: Some("picked".into()), effort: Some("high".into()),
        fast_mode: Some(false), permission_mode: Some(PermissionMode::Auto), chrome_enabled: Some(true),
        local_env: Some(BTreeMap::from([("PARITY_ENV".into(), agent::SecretString::new("synthetic-value"))])),
        ..ChatOptions::default() };
    let mut chat = Chat { cwd: "/synthetic/workspace".into(), resume: Some("saved".into()), live: None };
    let dirs = vec![PathBuf::from("/synthetic/linked")];
    let runner = ProbeRunner { launcher: Box::new(|cwd, resume| {
        let mut launch = launch(cwd, resume)?;
        launch.executable = "/synthetic/control".into();
        Ok(launch)
    }) };
    let launch = runner.ensure_live("chat", &mut chat, &dirs, &options).unwrap().unwrap();
    assert_eq!(launch.executable, PathBuf::from("/synthetic/control"));
    assert_eq!(launch.model.as_deref(), Some("picked")); assert_eq!(launch.effort.as_deref(), Some("high"));
    assert_eq!(launch.settings, Some(serde_json::json!({"fastMode": false})));
    assert_eq!(launch.permission_mode, PermissionMode::Auto); assert!(launch.chrome);
    assert_eq!(launch.env.value("PARITY_ENV"), Some("synthetic-value")); assert_eq!(launch.add_dirs, dirs);
    assert_eq!(launch.resume.as_deref(), Some("saved"));
}
#[test]
fn changing_one_chat_does_not_mutate_another() {
    let (mut one, _) = chat(Some("/synthetic/a"), false, true);
    let (mut other, session) = chat(Some("/synthetic/other"), false, true);
    let next = options_for_turn(Some("/synthetic/b"));
    let _ = runner().ensure_live("one", &mut one, &[], &next);
    let unchanged = options_for_turn(Some("/synthetic/other"));
    assert!(runner().ensure_live("other", &mut other, &[], &unchanged).unwrap().is_none());
    let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0));
}
