//! Pure DTOs around the actual ensure_live prefix; no executable or session I/O.
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde_json::Value;
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
pub enum PermissionMode { Default, Plan, Auto, BypassPermissions }
#[derive(Debug)]
pub struct ClaudeLaunch {
    pub chrome: bool, pub model: Option<String>, pub effort: Option<String>,
    pub settings: Option<Value>, pub permission_mode: PermissionMode,
    pub add_dirs: Vec<PathBuf>, pub resume: Option<String>,
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
struct Live {
    directories: Vec<PathBuf>, options: ChatOptions,
    session: Arc<Mutex<ProbeSession>>, state: Arc<Mutex<TurnState>>,
}
struct Chat { cwd: PathBuf, resume: Option<String>, live: Option<Live> }
type Launcher = Box<dyn Fn(&Path, Option<String>) -> Result<ClaudeLaunch, String>>;
struct ProbeRunner { launcher: Launcher }
impl ProbeRunner {
/* ENSURE_LIVE_PREFIX */
}
fn paths(values: &[&str]) -> Vec<PathBuf> { values.iter().map(PathBuf::from).collect() }
fn runner() -> ProbeRunner {
    ProbeRunner { launcher: Box::new(|_, resume| Ok(ClaudeLaunch {
        chrome: false, model: None, effort: None, settings: None,
        permission_mode: PermissionMode::Default, add_dirs: vec!["/stale-launcher".into()], resume,
    })) }
}
fn chat(directories: &[&str], busy: bool, alive: bool) -> (Chat, Arc<Mutex<ProbeSession>>) {
    let session = Arc::new(Mutex::new(ProbeSession::default()));
    (Chat { cwd: "/fixture".into(), resume: Some("stored".into()), live: Some(Live {
        directories: paths(directories), options: ChatOptions::default(), session: session.clone(),
        state: Arc::new(Mutex::new(TurnState {
            alive, waiting: if busy { vec![()] } else { vec![] },
            mapper: Mapper(Some("observed".into())),
        })),
    }) }, session)
}
fn changed_idle(before: &[&str], after: &[&str]) {
    let (mut chat, session) = chat(before, false, true);
    let launch = runner().ensure_live("chat", &mut chat, &paths(after), &ChatOptions::default())
        .expect("changed linked directories must reconcile at the next idle turn")
        .expect("changed linked directories must not reuse the old generator");
    assert_eq!(launch.add_dirs, paths(after));
    assert_eq!(launch.resume.as_deref(), Some("observed"));
    assert_eq!(chat.resume.as_deref(), Some("observed"));
    let s = session.lock().unwrap(); assert_eq!((s.kills, s.waits), (1, 1));
}
#[test] fn adding_directories_recreates_at_idle() { changed_idle(&[], &["/one"]); }
#[test] fn removing_directories_recreates_at_idle() { changed_idle(&["/one"], &[]); }
#[test] fn replacing_directories_recreates_at_idle() { changed_idle(&["/one"], &["/two"]); }
#[test] fn reordering_directories_recreates_at_idle() { changed_idle(&["/one", "/two"], &["/two", "/one"]); }
#[test]
fn unchanged_directories_reuse_idle_and_busy_generators() {
    for busy in [false, true] { for dirs in [vec![], vec!["/one", "/two"]] {
        let (mut chat, session) = chat(&dirs, busy, true);
        assert!(runner().ensure_live("chat", &mut chat, &paths(&dirs), &ChatOptions::default()).unwrap().is_none());
        let s = session.lock().unwrap(); assert_eq!((s.kills, s.waits), (0, 0));
    } }
}
#[test]
fn directory_changes_never_kill_a_busy_generator() {
    let (mut chat, session) = chat(&["/one"], true, true);
    assert!(runner().ensure_live("chat", &mut chat, &paths(&["/two"]), &ChatOptions::default()).is_err());
    let s = session.lock().unwrap(); assert_eq!((s.kills, s.waits), (0, 0));
    assert_eq!(chat.resume.as_deref(), Some("stored"));
    assert_eq!(chat.live.as_ref().unwrap().directories, paths(&["/one"]));
}
#[test]
fn deferred_directory_change_retries_after_busy_turn_finishes() {
    let (mut chat, session) = chat(&["/one"], true, true);
    assert!(runner().ensure_live("chat", &mut chat, &[], &ChatOptions::default()).is_err());
    chat.live.as_ref().unwrap().state.lock().unwrap().waiting.clear();
    let launch = runner().ensure_live("chat", &mut chat, &[], &ChatOptions::default()).unwrap().unwrap();
    assert!(launch.add_dirs.is_empty());
    let s = session.lock().unwrap(); assert_eq!((s.kills, s.waits), (1, 1));
}
#[test]
fn dead_generator_restarts_with_current_directories() {
    let (mut chat, _) = chat(&["/one"], false, false);
    let launch = runner().ensure_live("chat", &mut chat, &paths(&["/two"]), &ChatOptions::default()).unwrap().unwrap();
    assert_eq!(launch.add_dirs, paths(&["/two"]));
    assert_eq!(launch.resume.as_deref(), Some("observed"));
}
#[test]
fn first_launch_uses_current_directories_and_saved_identity() {
    let mut chat = Chat { cwd: "/fixture".into(), resume: Some("saved".into()), live: None };
    let launch = runner().ensure_live("chat", &mut chat, &paths(&["/one"]), &ChatOptions::default()).unwrap().unwrap();
    assert_eq!(launch.add_dirs, paths(&["/one"]));
    assert_eq!(launch.resume.as_deref(), Some("saved"));
}
#[test]
fn option_changes_preserve_current_directories_and_other_chats() {
    let (mut changed, _) = chat(&["/one"], false, true);
    let options = ChatOptions { model: Some("picked".into()), effort: Some("high".into()),
        fast_mode: Some(false), permission_mode: Some(PermissionMode::Plan), ..ChatOptions::default() };
    let launch = runner().ensure_live("changed", &mut changed, &paths(&["/one"]), &options).unwrap().unwrap();
    assert_eq!(launch.add_dirs, paths(&["/one"])); assert_eq!(launch.model.as_deref(), Some("picked"));
    assert_eq!(launch.effort.as_deref(), Some("high")); assert_eq!(launch.permission_mode, PermissionMode::Plan);
    assert_eq!(launch.settings, Some(serde_json::json!({"fastMode":false})));
    let (mut other, session) = chat(&["/other"], false, true);
    assert!(runner().ensure_live("other", &mut other, &paths(&["/other"]), &ChatOptions::default()).unwrap().is_none());
    let s = session.lock().unwrap(); assert_eq!((s.kills, s.waits), (0, 0));
}
