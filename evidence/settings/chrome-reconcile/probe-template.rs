//! Pure adapters around the actual production reuse/launch preparation prefix.
//! Session operations below are counters only; no process, provider or database.
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde_json::{json, Value};
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
mod app_prefs { pub mod commands {
    pub struct AppPrefs { pub chrome_mode_enabled: bool }
    pub async fn load(value: &Result<bool, String>) -> Result<AppPrefs, String> {
        value.clone().map(|chrome_mode_enabled| AppPrefs { chrome_mode_enabled })
    }
} }
struct Db(Result<bool, String>);
fn block_on<F: std::future::Future>(future: F) -> F::Output {
    struct Wake;
    impl std::task::Wake for Wake { fn wake(self: Arc<Self>) {} }
    let waker = std::task::Waker::from(Arc::new(Wake));
    let mut context = std::task::Context::from_waker(&waker);
    let mut future = std::pin::pin!(future);
    match future.as_mut().poll(&mut context) {
        std::task::Poll::Ready(value) => value,
        std::task::Poll::Pending => panic!("pure preference adapter must be immediately ready"),
    }
}
async fn snapshot(saved: Result<bool, String>, input: Value) -> Result<ChatOptions, String> {
    let mut options: ChatOptions = serde_json::from_value(input).map_err(|e| e.to_string())?;
    let db = Db(saved);
/* CHROME_SNAPSHOT */
    Ok(options)
}
fn opts(saved: bool) -> ChatOptions { block_on(snapshot(Ok(saved), json!({}))).unwrap() }
fn runner(stale_chrome: bool) -> ProbeRunner {
    ProbeRunner { launcher: Box::new(move |_, resume| Ok(ClaudeLaunch {
        chrome: stale_chrome, model: None, effort: None, settings: None,
        permission_mode: PermissionMode::Default, add_dirs: vec![], resume,
    })) }
}
fn chat(options: ChatOptions, busy: bool) -> (Chat, Arc<Mutex<ProbeSession>>) {
    let session = Arc::new(Mutex::new(ProbeSession::default()));
    (Chat { cwd: "/fixture".into(), resume: Some("stored".into()), live: Some(Live {
        directories: vec![], options, session: session.clone(), state: Arc::new(Mutex::new(TurnState {
            alive: true, waiting: if busy { vec![()] } else { vec![] },
            mapper: Mapper(Some("observed".into())),
        })),
    }) }, session)
}
#[test]
fn chrome_off_to_on_restarts_idle_session_with_observed_resume() {
    let (mut chat, session) = chat(opts(false), false);
    let launch = runner(false).ensure_live("chat", &mut chat, &[], &opts(true)).unwrap()
        .expect("changed Chrome policy must not reuse the previous generator");
    assert!(launch.chrome);
    assert_eq!(launch.resume.as_deref(), Some("observed"));
    let session = session.lock().unwrap();
    assert_eq!((session.kills, session.waits), (1, 1));
}
#[test]
fn chrome_on_to_off_restarts_idle_session_and_removes_flag() {
    let (mut chat, _) = chat(opts(true), false);
    let launch = runner(true).ensure_live("chat", &mut chat, &[], &opts(false)).unwrap()
        .expect("disabling Chrome must not reuse the previous generator");
    assert!(!launch.chrome);
}
#[test]
fn chrome_change_never_kills_an_active_turn() {
    let (mut chat, session) = chat(opts(false), true);
    let result = runner(false).ensure_live("chat", &mut chat, &[], &opts(true));
    assert!(result.is_err(), "changed policy must wait for the active turn");
    let session = session.lock().unwrap();
    assert_eq!((session.kills, session.waits), (0, 0));
}
#[test]
fn chrome_unchanged_policy_reuses_idle_and_busy_sessions() {
    for saved in [false, true] { for busy in [false, true] {
        let (mut chat, session) = chat(opts(saved), busy);
        assert!(runner(saved).ensure_live("chat", &mut chat, &[], &opts(saved)).unwrap().is_none());
        let session = session.lock().unwrap(); assert_eq!((session.kills, session.waits), (0, 0));
    } }
}
#[test]
fn chrome_snapshot_controls_first_launch_despite_stale_launcher_value() {
    for saved in [false, true] {
        let mut chat = Chat { cwd: "/fixture".into(), resume: Some("stored".into()), live: None };
        let launch = runner(!saved).ensure_live("chat", &mut chat, &[], &opts(saved)).unwrap().unwrap();
        assert_eq!(launch.chrome, saved, "per-turn saved preference is authoritative");
        assert_eq!(launch.resume.as_deref(), Some("stored"));
    }
}
#[test]
fn chrome_wire_fields_cannot_override_saved_policy() {
    for saved in [false, true] {
        let malicious = json!({"chrome_enabled": !saved, "chromeEnabled": !saved, "chrome": !saved});
        assert_eq!(block_on(snapshot(Ok(saved), malicious)).unwrap(), opts(saved));
    }
}
#[test]
fn chrome_preference_read_error_does_not_reuse_stale_policy() {
    assert!(block_on(snapshot(Err("preference unavailable".into()), json!({}))).is_err());
}
#[test]
fn chrome_preserves_existing_plan_fast_model_effort_and_directory_guards() {
    let mut picked = opts(true);
    picked.model = Some("picked".into()); picked.effort = Some("high".into());
    picked.fast_mode = Some(false); picked.permission_mode = Some(PermissionMode::Plan);
    let mut empty = Chat { cwd: "/fixture".into(), resume: None, live: None };
    let launch = runner(true).ensure_live("chat", &mut empty, &[], &picked).unwrap().unwrap();
    assert_eq!(launch.model.as_deref(), Some("picked")); assert_eq!(launch.effort.as_deref(), Some("high"));
    assert_eq!(launch.permission_mode, PermissionMode::Plan); assert_eq!(launch.settings, Some(json!({"fastMode":false})));
    let (mut linked, session) = chat(opts(true), false);
    assert!(runner(true).ensure_live("chat", &mut linked, &["/other".into()], &opts(false)).is_err());
    assert_eq!(session.lock().unwrap().kills, 0);
}
#[test]
fn chrome_change_does_not_touch_another_chat() {
    let (mut changed, _) = chat(opts(false), false);
    let (mut other, session) = chat(opts(false), false);
    let _ = runner(false).ensure_live("changed", &mut changed, &[], &opts(true));
    assert!(runner(false).ensure_live("other", &mut other, &[], &opts(false)).unwrap().is_none());
    assert_eq!(session.lock().unwrap().kills, 0);
}
