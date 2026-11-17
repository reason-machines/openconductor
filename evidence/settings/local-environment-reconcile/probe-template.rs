//! Actual command env wiring and ensure_live prefix around no-process DTOs.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde_json::Value;
mod agent {
    use std::fmt;
    /* SECRET_STRING */
}
mod settings { pub mod effective {
    use super::super::*;
    thread_local! { static ENV: std::cell::RefCell<BTreeMap<String, String>> = const { std::cell::RefCell::new(BTreeMap::new()) }; }
    pub fn set(entries: &[(&str, &str)]) {
        ENV.with(|env| *env.borrow_mut() = entries.iter().map(|(k,v)| (k.to_string(),v.to_string())).collect());
    }
    pub fn local_env_for_dir(_: &Path) -> BTreeMap<String, String> { ENV.with(|env| env.borrow().clone()) }
} }
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
pub enum PermissionMode { Default, Plan, Auto, BypassPermissions }
#[derive(Debug, Default)]
pub struct Env(BTreeMap<String, agent::SecretString>);
impl Env {
    fn set(&mut self, k: &str, v: impl Into<String>) { self.set_secret(k, agent::SecretString::new(v)); }
    fn set_secret(&mut self, k: &str, v: agent::SecretString) { self.0.insert(k.to_owned(), v); }
    fn value(&self, k: &str) -> Option<&str> { self.0.get(k).map(agent::SecretString::expose) }
}
#[derive(Debug)]
pub struct ClaudeLaunch {
    pub chrome: bool, pub model: Option<String>, pub effort: Option<String>,
    pub settings: Option<Value>, pub permission_mode: PermissionMode,
    pub add_dirs: Vec<PathBuf>, pub resume: Option<String>, pub env: Env,
}
/* OPTIONS */
struct Mapper(Option<String>);
impl Mapper { fn session_id(&self) -> Option<&str> { self.0.as_deref() } }
#[derive(Default)]
struct ProbeSession { kills: usize, waits: usize }
impl ProbeSession {
    fn kill(&mut self) -> Result<(), String> { self.kills += 1; Ok(()) }
    fn wait(&mut self) -> Result<(), String> { self.waits += 1; Ok(()) }
}
struct TurnState { alive: bool, waiting: Vec<()>, mapper: Mapper }
struct Live { directories: Vec<PathBuf>, options: ChatOptions,
    session: Arc<Mutex<ProbeSession>>, state: Arc<Mutex<TurnState>> }
struct Chat { cwd: PathBuf, resume: Option<String>, live: Option<Live> }
type Launcher = Box<dyn Fn(&Path, Option<String>) -> Result<ClaudeLaunch, String>>;
struct ProbeRunner { launcher: Launcher }
impl ProbeRunner {
/* ENSURE_LIVE_PREFIX */
}
fn launch(cwd: &Path, resume: Option<String>) -> ClaudeLaunch {
    let mut launch = ClaudeLaunch {
        chrome: false, model: None, effort: None, settings: None,
        permission_mode: PermissionMode::Default, add_dirs: vec![], resume, env: Env::default(),
    };
    launch.env.set("PROVIDER_CONTROL", "provider-retained");
    /* LAUNCHER_ENV */
    launch
}
fn runner() -> ProbeRunner { ProbeRunner { launcher: Box::new(|cwd, resume| Ok(launch(cwd, resume))) } }
fn options_for_turn(entries: &[(&str, &str)]) -> ChatOptions {
    settings::effective::set(entries);
    let cwd = Some(PathBuf::from("/synthetic/workspace"));
    let mut options = ChatOptions::default();
    /* COMMAND_TURN_ENV */
    options
}
fn chat(entries: &[(&str, &str)], busy: bool, alive: bool) -> (Chat, Arc<Mutex<ProbeSession>>) {
    let options = options_for_turn(entries);
    let session = Arc::new(Mutex::new(ProbeSession::default()));
    (Chat { cwd: "/synthetic/workspace".into(), resume: Some("saved".into()), live: Some(Live {
        directories: vec![], options, session: session.clone(),
        state: Arc::new(Mutex::new(TurnState { alive, waiting: if busy { vec![()] } else { vec![] }, mapper: Mapper(Some("observed".into())) })),
    }) }, session)
}
fn changed_idle(before: &[(&str, &str)], after: &[(&str, &str)]) {
    let (mut chat, session) = chat(before, false, true);
    let options = options_for_turn(after);
    let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap()
        .expect("changed local environment must recreate the idle generator");
    for (k,v) in after { assert_eq!(launch.env.value(k), Some(*v)); }
    for (k,_) in before { if !after.iter().any(|(key,_)| key == k) { assert_eq!(launch.env.value(k), None); } }
    assert_eq!(launch.env.value("PROVIDER_CONTROL"), Some("provider-retained"));
    assert_eq!(launch.resume.as_deref(), Some("observed"));
    let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (1, 1));
}
#[test] fn adding_environment_recreates_idle_generator() { changed_idle(&[], &[("PARITY_ENV", "first")]); }
#[test] fn changing_environment_value_recreates_idle_generator() { changed_idle(&[("PARITY_ENV", "first")], &[("PARITY_ENV", "second")]); }
#[test] fn removing_environment_recreates_idle_generator() { changed_idle(&[("PARITY_ENV", "first")], &[]); }
#[test] fn renaming_environment_recreates_idle_generator() { changed_idle(&[("BEFORE", "same")], &[("AFTER", "same")]); }
#[test]
fn unchanged_environment_reuses_idle_and_busy_generators() {
    for busy in [false, true] { for entries in [vec![], vec![("PARITY_ENV", "same")]] {
        let (mut chat, session) = chat(&entries, busy, true);
        let options = options_for_turn(&entries);
        assert!(runner().ensure_live("chat", &mut chat, &[], &options).unwrap().is_none());
        let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0));
    } }
}
#[test]
fn environment_entry_order_does_not_restart() {
    let (mut chat, session) = chat(&[("A", "first"), ("B", "second")], false, true);
    let options = options_for_turn(&[("B", "second"), ("A", "first")]);
    assert!(runner().ensure_live("chat", &mut chat, &[], &options).unwrap().is_none());
    let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0));
}
#[test]
fn changed_environment_never_kills_busy_generator_and_retries_at_idle() {
    let (mut chat, session) = chat(&[("PARITY_ENV", "first")], true, true);
    let options = options_for_turn(&[("PARITY_ENV", "second")]);
    assert!(runner().ensure_live("chat", &mut chat, &[], &options).is_err());
    { let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0)); }
    assert_eq!(chat.resume.as_deref(), Some("saved"));
    chat.live.as_ref().unwrap().state.lock().unwrap().waiting.clear();
    let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap().unwrap();
    assert_eq!(launch.env.value("PARITY_ENV"), Some("second"));
    assert_eq!(launch.resume.as_deref(), Some("observed"));
}
#[test]
fn first_and_dead_launch_use_current_environment_and_resume_identity() {
    for dead in [false, true] {
        let (mut chat, _) = chat(&[("PARITY_ENV", "first")], false, false);
        if !dead { chat.live = None; }
        let options = options_for_turn(&[("PARITY_ENV", "second")]);
        let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap().unwrap();
        assert_eq!(launch.env.value("PARITY_ENV"), Some("second"));
        assert_eq!(launch.resume.as_deref(), Some(if dead { "observed" } else { "saved" }));
    }
}
#[test]
fn launch_uses_captured_turn_environment_not_a_second_read() {
    let options = options_for_turn(&[("PARITY_ENV", "captured")]);
    settings::effective::set(&[("PARITY_ENV", "later"), ("AFTER_SNAPSHOT", "must-not-leak")]);
    let mut chat = Chat { cwd: "/synthetic/workspace".into(), resume: None, live: None };
    let launch = runner().ensure_live("chat", &mut chat, &[], &options).unwrap().unwrap();
    assert_eq!(launch.env.value("PARITY_ENV"), Some("captured"));
    assert_eq!(launch.env.value("AFTER_SNAPSHOT"), None);
}
#[test]
fn unrelated_options_and_other_chat_are_preserved() {
    let (mut chat, _) = chat(&[("PARITY_ENV", "same")], false, true);
    let mut options = options_for_turn(&[("PARITY_ENV", "same")]);
    options.model = Some("picked".into()); options.effort = Some("high".into());
    options.fast_mode = Some(false); options.permission_mode = Some(PermissionMode::Auto); options.chrome_enabled = Some(true);
    let dirs = vec![PathBuf::from("/linked")];
    let launch = runner().ensure_live("chat", &mut chat, &dirs, &options).unwrap().unwrap();
    assert_eq!(launch.model.as_deref(), Some("picked")); assert_eq!(launch.effort.as_deref(), Some("high"));
    assert_eq!(launch.settings, Some(serde_json::json!({"fastMode":false})));
    assert_eq!(launch.permission_mode, PermissionMode::Auto); assert!(launch.chrome); assert_eq!(launch.add_dirs, dirs);
    let (mut other, session) = self::chat(&[("OTHER", "unchanged")], false, true);
    let options = options_for_turn(&[("OTHER", "unchanged")]);
    assert!(runner().ensure_live("other", &mut other, &[], &options).unwrap().is_none());
    let st = session.lock().unwrap(); assert_eq!((st.kills, st.waits), (0, 0));
}
