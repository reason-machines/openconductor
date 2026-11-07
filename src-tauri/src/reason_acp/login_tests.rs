use super::cli::LaunchConfig;
use super::login::{LoginOptions, LoginService, LoginState};
use super::test_exe::write_executable;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

fn fixture(body: &str) -> (PathBuf, LaunchConfig) {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "oc-login-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let dir = dir.canonicalize().unwrap();
    let cli = dir.join("reason");
    write_executable(&cli, &format!("#!/bin/sh\n{body}\n"), 0o755);
    (dir, LaunchConfig::new(cli).unwrap())
}

fn service(timeout: Duration) -> LoginService {
    LoginService::with_options(LoginOptions {
        startup_timeout: Duration::from_millis(500),
        status_timeout: Duration::from_millis(300),
        timeout,
        poll_interval: Duration::from_millis(20),
        allow_loopback: false,
    })
}

fn wait(service: &LoginService, matches: impl Fn(&LoginState) -> bool) -> LoginState {
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let state = service.snapshot();
        if matches(&state) {
            return state;
        }
        assert!(
            Instant::now() < deadline,
            "unexpected login state: {state:?}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

const STATUS: &str = "if [ \"$1\" = status ]; then if [ -f approved ]; then echo '{\"account\":{\"email\":\"fixture@example.invalid\"},\"organization\":{\"name\":\"Reason Tests\"},\"workspaces\":[{\"slug\":\"reason-tests\",\"name\":\"Reason Tests\",\"selected\":true}]}'; else echo '{\"account\":null}'; fi; exit; fi";
const LINK: &str = "echo 'Open this link to sign in to Reason: https://reasonmachines.com/cli/connect?request=fixture'; echo 'The page shows the code TEST-CODE.'";

#[test]
fn one_pairing_is_shared_until_approved_and_returns_account_and_workspace() {
    let (dir, launch) = fixture(&format!("{STATUS}\necho start >> starts\n{LINK}"));
    let service = service(Duration::from_secs(2));
    service.start(launch.clone(), dir.clone());
    let first = wait(&service, |state| {
        matches!(state, LoginState::Waiting { .. })
    });
    assert_eq!(service.start(launch, dir.clone()), first);
    assert_eq!(
        std::fs::read_to_string(dir.join("starts"))
            .unwrap()
            .lines()
            .count(),
        1
    );
    std::fs::write(dir.join("approved"), "").unwrap();
    let result = wait(&service, |state| {
        matches!(state, LoginState::Connected { .. })
    });
    let LoginState::Connected { account } = result else {
        unreachable!()
    };
    assert_eq!(account.email.as_deref(), Some("fixture@example.invalid"));
    assert_eq!(account.organization.as_deref(), Some("Reason Tests"));
    assert_eq!(account.workspaces[0].slug, "reason-tests");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn built_app_fake_waits_for_explicit_approval_before_connecting() {
    let root = std::env::var("REASON_ACP_REPO_ROOT")
        .unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/..").into());
    let fake = PathBuf::from(root).join("tools/reason-acp/fake_reason_acp.py");
    let (dir, launch) = fixture(&format!("exec python3 \"{}\" \"$@\"", fake.display()));
    std::fs::write(dir.join("fake-reason-signed-out"), "").unwrap();
    std::fs::write(dir.join("fake-reason-require-approval"), "").unwrap();
    let service = service(Duration::from_secs(5));
    service.start(launch, dir.clone());
    let state = wait(&service, |state| {
        matches!(state, LoginState::Waiting { .. })
    });
    let LoginState::Waiting { prompt, .. } = &state else {
        unreachable!()
    };
    assert_eq!(prompt.code.as_deref(), Some("E2E1-CODE"));
    assert_eq!(
        prompt.url,
        "https://reasonmachines.com/cli/connect?request=e2e-request"
    );
    std::thread::sleep(Duration::from_millis(120));
    assert_eq!(
        service.snapshot(),
        state,
        "status reads cannot approve pairing"
    );
    std::fs::remove_file(dir.join("fake-reason-signed-out")).unwrap();
    let LoginState::Connected { account } = wait(&service, |state| {
        matches!(state, LoginState::Connected { .. })
    }) else {
        unreachable!()
    };
    assert_eq!(account.email.as_deref(), Some("e2e@example.com"));
    assert_eq!(account.workspaces[0].slug, "ws-a");
    drop(service);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn refresh_reads_existing_account_on_fresh_app_and_clears_external_expiry() {
    let (dir, launch) = fixture(&format!("{STATUS}\necho unexpected >> mutation\nexit 1"));
    std::fs::write(dir.join("approved"), "existing valid login").unwrap();
    let service = service(Duration::from_secs(2));
    assert!(matches!(
        service.refresh(&launch, &dir).unwrap(),
        LoginState::Connected { .. }
    ));
    std::fs::remove_file(dir.join("approved")).unwrap();
    assert_eq!(service.refresh(&launch, &dir).unwrap(), LoginState::Idle);
    assert!(!dir.join("mutation").exists());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn account_refresh_cannot_restore_a_snapshot_after_explicit_reset() {
    let (dir, launch) = fixture("touch refresh.started\nwhile [ ! -f release ]; do sleep 0.01; done\necho '{\"account\":{\"email\":\"fixture@example.invalid\"}}'");
    let service = std::sync::Arc::new(service(Duration::from_secs(2)));
    let refreshing = service.clone();
    let cwd = dir.clone();
    let reader = std::thread::spawn(move || refreshing.refresh(&launch, &cwd));
    let deadline = Instant::now() + Duration::from_secs(2);
    while !dir.join("refresh.started").exists() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(5));
    }
    service.reset();
    std::fs::write(dir.join("release"), "").unwrap();
    assert_eq!(reader.join().unwrap().unwrap(), LoginState::Idle);
    assert_eq!(service.snapshot(), LoginState::Idle);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn existing_login_never_launches_login_or_logout_and_cancel_does_not_delete_it() {
    let (dir, launch) = fixture(&format!("{STATUS}\necho unexpected >> mutation\nexit 1"));
    std::fs::write(dir.join("approved"), "existing valid login").unwrap();
    let service = service(Duration::from_secs(2));
    let state = service.start(launch, dir.clone());
    let LoginState::Starting { attempt_id } = state else {
        panic!("not starting")
    };
    let connected = wait(&service, |state| {
        matches!(state, LoginState::Connected { .. })
    });
    assert_eq!(service.cancel(&attempt_id), connected);
    assert!(!dir.join("mutation").exists());
    assert_eq!(
        std::fs::read_to_string(dir.join("approved")).unwrap(),
        "existing valid login"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cancel_stops_polling_ignores_late_approval_and_retry_reads_existing_login() {
    let (dir, launch) = fixture(&format!("echo call >> calls\n{STATUS}\n{LINK}"));
    let service = service(Duration::from_secs(2));
    service.start(launch.clone(), dir.clone());
    let LoginState::Waiting { attempt_id, .. } = wait(&service, |state| {
        matches!(state, LoginState::Waiting { .. })
    }) else {
        unreachable!()
    };
    assert_eq!(service.cancel(&attempt_id), LoginState::Cancelled);
    std::thread::sleep(Duration::from_millis(80));
    let calls = std::fs::read_to_string(dir.join("calls")).unwrap();
    std::fs::write(dir.join("approved"), "").unwrap();
    std::thread::sleep(Duration::from_millis(80));
    assert_eq!(service.snapshot(), LoginState::Cancelled);
    assert_eq!(
        service.refresh(&launch, &dir).unwrap(),
        LoginState::Cancelled
    );
    assert_eq!(std::fs::read_to_string(dir.join("calls")).unwrap(), calls);
    service.start(launch, dir.clone());
    wait(&service, |state| {
        matches!(state, LoginState::Connected { .. })
    });
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn expired_app_wait_can_be_retried_without_a_stale_attempt_cancelling_it() {
    let (dir, launch) = fixture(&format!("{STATUS}\n{LINK}"));
    let service = service(Duration::from_millis(150));
    let LoginState::Starting { attempt_id: old } = service.start(launch.clone(), dir.clone())
    else {
        unreachable!()
    };
    wait(&service, |state| matches!(state, LoginState::TimedOut));
    service.start(launch, dir.clone());
    let retry = wait(&service, |state| {
        matches!(state, LoginState::Waiting { .. })
    });
    assert_eq!(service.cancel(&old), retry);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cancel_kills_and_reaps_its_foreground_login_process() {
    let (dir, launch) = fixture(&format!("{STATUS}\necho $$ > login.pid\nexec sleep 30"));
    let service = service(Duration::from_secs(2));
    let LoginState::Starting { attempt_id } = service.start(launch, dir.clone()) else {
        unreachable!()
    };
    let deadline = Instant::now() + Duration::from_secs(2);
    while !dir.join("login.pid").exists() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    let pid = std::fs::read_to_string(dir.join("login.pid")).unwrap();
    service.cancel(&attempt_id);
    loop {
        let alive = std::process::Command::new("/bin/kill")
            .args(["-0", pid.trim()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .success();
        if !alive {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "owned foreground login was not reaped"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn reset_for_explicit_logout_clears_the_canonical_account_snapshot() {
    let (dir, launch) = fixture(STATUS);
    std::fs::write(dir.join("approved"), "").unwrap();
    let service = service(Duration::from_secs(2));
    service.start(launch, dir.clone());
    wait(&service, |state| {
        matches!(state, LoginState::Connected { .. })
    });
    service.reset();
    assert_eq!(service.snapshot(), LoginState::Idle);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn production_rejects_local_pairing_urls_but_explicit_fake_options_allow_them() {
    let (dir, launch) = fixture(&format!("{STATUS}\necho 'Open this link to sign in to Reason: http://127.0.0.1:41234/cli/connect?request=fake'"));
    let production = service(Duration::from_secs(1));
    production.start(launch.clone(), dir.clone());
    wait(&production, |state| {
        matches!(state, LoginState::Failed { .. })
    });
    let fake = LoginService::with_options(LoginOptions {
        allow_loopback: true,
        ..LoginOptions::default()
    });
    fake.start(launch, dir.clone());
    wait(&fake, |state| matches!(state, LoginState::Waiting { .. }));
    drop(fake);
    let _ = std::fs::remove_dir_all(dir);
}
