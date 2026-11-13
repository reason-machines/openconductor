use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Barrier;

fn v(text: &str) -> Version {
    Version::parse(text).unwrap()
}

struct Fake {
    latest: Result<Version, String>,
    installed: Option<Version>,
    activated: Option<Version>,
    failure: Option<String>,
    remove_on_failure: bool,
    version_error: Option<String>,
    installs: usize,
    checks: usize,
}

impl Fake {
    fn new(installed: Option<&str>) -> Self {
        Self {
            latest: Ok(v("0.2.728")),
            installed: installed.map(v),
            activated: Some(v("0.2.728")),
            failure: None,
            remove_on_failure: false,
            version_error: None,
            installs: 0,
            checks: 0,
        }
    }
}

impl InstallOperations for Fake {
    fn latest(&mut self) -> Result<Version, String> {
        self.latest.clone()
    }
    fn version(&mut self, cli: &Path) -> Result<Version, String> {
        assert_eq!(cli, Path::new("/test/home/.local/bin/reason"));
        self.checks += 1;
        if let Some(error) = &self.version_error {
            return Err(error.clone());
        }
        self.installed.clone().ok_or_else(|| "missing".into())
    }
    fn install(&mut self, directory: &Path, version: &Version) -> Result<(), String> {
        assert_eq!(directory, Path::new("/test/home/.local/bin"));
        assert_eq!(version, &v("0.2.728"));
        self.installs += 1;
        if let Some(error) = &self.failure {
            if self.remove_on_failure {
                self.installed = None;
            }
            return Err(error.clone());
        }
        self.installed = self.activated.clone();
        Ok(())
    }
}

fn ensure(fake: &mut Fake) -> InstallResult {
    ensure_with(Path::new("/test/home"), fake)
}

#[test]
fn missing_cli_is_installed_and_its_actual_version_is_verified() {
    let mut fake = Fake::new(None);
    let result = ensure(&mut fake).unwrap();
    assert_eq!(
        result,
        InstalledCli {
            path: "/test/home/.local/bin/reason".into(),
            version: "0.2.728".into(),
            warning: None,
        }
    );
    assert_eq!(fake.installs, 1);
    assert_eq!(fake.checks, 2);
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        serde_json::json!({"path":"/test/home/.local/bin/reason","version":"0.2.728"})
    );
}

#[test]
fn stale_cli_is_updated_once_and_current_cli_is_not_reinstalled() {
    let mut fake = Fake::new(Some("0.2.9"));
    ensure(&mut fake).unwrap();
    ensure(&mut fake).unwrap();
    assert_eq!(fake.installs, 1);
}

#[test]
fn newer_cli_is_not_downgraded_and_returns_actual_version() {
    let mut fake = Fake::new(Some("0.2.729"));
    assert_eq!(ensure(&mut fake).unwrap().version, "0.2.729");
    assert_eq!(fake.installs, 0);
}

#[test]
fn installer_failure_is_not_reported_as_success_and_can_be_retried() {
    let mut fake = Fake::new(None);
    fake.failure = Some("download failed".into());
    assert_eq!(ensure(&mut fake).unwrap_err(), "download failed");
    fake.failure = None;
    ensure(&mut fake).unwrap();
    assert_eq!(fake.installs, 2);
}

fn assert_degraded(result: InstalledCli, version: &str, cause: &str) {
    let result = serde_json::to_value(result).unwrap();
    assert_eq!(result["path"], "/test/home/.local/bin/reason");
    assert_eq!(result["version"], version);
    let warning = result["warning"].as_str().unwrap();
    assert!(
        warning.contains("update could not be verified"),
        "{warning}"
    );
    assert!(warning.contains(cause), "{warning}");
}

#[test]
fn working_cli_remains_available_when_release_lookup_is_offline() {
    let mut fake = Fake::new(Some("0.2.9"));
    fake.latest = Err("offline".into());
    assert_degraded(ensure(&mut fake).unwrap(), "0.2.9", "offline");
    assert_eq!(fake.installs, 0);
    assert_eq!(fake.checks, 1);
}

#[test]
fn failed_update_reprobes_the_working_previous_cli() {
    let mut fake = Fake::new(Some("0.2.9"));
    fake.failure = Some("download failed".into());
    assert_degraded(ensure(&mut fake).unwrap(), "0.2.9", "download failed");
    assert_eq!(fake.installs, 1);
    assert_eq!(fake.checks, 2);
    fake.failure = None;
    let result = serde_json::to_value(ensure(&mut fake).unwrap()).unwrap();
    assert_eq!(result["version"], "0.2.728");
    assert!(result.get("warning").is_none());
    assert_eq!(fake.installs, 2);
}

#[test]
fn partial_failed_update_cannot_reuse_a_previously_working_probe() {
    let mut fake = Fake::new(Some("0.2.9"));
    fake.failure = Some("partial installation failed".into());
    fake.remove_on_failure = true;
    assert_eq!(
        ensure(&mut fake).unwrap_err(),
        "partial installation failed"
    );
    assert_eq!(fake.checks, 2);
}

#[test]
fn success_exit_without_current_activation_warns_only_if_cli_still_works() {
    let mut fake = Fake::new(Some("0.2.1"));
    fake.activated = Some(v("0.2.2"));
    assert_degraded(ensure(&mut fake).unwrap(), "0.2.2", "did not activate");
    assert_eq!(fake.checks, 3);
    fake.activated = None;
    assert!(ensure(&mut fake).unwrap_err().contains("did not answer"));
}

#[test]
fn offline_release_with_missing_or_broken_cli_still_rejects() {
    for installed in [None, Some("0.2.728")] {
        let mut fake = Fake::new(installed);
        fake.latest = Err("offline".into());
        if installed.is_some() {
            fake.version_error = Some("invalid version".into());
        }
        assert_eq!(ensure(&mut fake).unwrap_err(), "offline");
        assert_eq!(fake.installs, 0);
        assert_eq!(fake.checks, 1);
    }
}

#[test]
fn healthy_current_cli_has_no_warning_or_reinstallation() {
    let mut fake = Fake::new(Some("0.2.728"));
    let result = serde_json::to_value(ensure(&mut fake).unwrap()).unwrap();
    assert_eq!(result["version"], "0.2.728");
    assert!(result.get("warning").is_none());
    assert_eq!(fake.installs, 0);
}

#[test]
fn next_launch_checks_the_release_again() {
    let service = CliInstaller::default();
    let calls = AtomicUsize::new(0);
    for _ in 0..2 {
        service
            .coalesce(|| {
                calls.fetch_add(1, Ordering::SeqCst);
                Err("offline".into())
            })
            .unwrap_err();
    }
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[test]
fn overlapping_requests_share_one_install_and_one_failure() {
    for failure in [false, true] {
        let service = CliInstaller::default();
        let calls = AtomicUsize::new(0);
        let start = Barrier::new(8);
        std::thread::scope(|scope| {
            let mut workers = Vec::new();
            for _ in 0..8 {
                workers.push(scope.spawn(|| {
                    start.wait();
                    service.coalesce(|| {
                        calls.fetch_add(1, Ordering::SeqCst);
                        std::thread::sleep(Duration::from_millis(200));
                        if failure {
                            Err("offline".into())
                        } else {
                            Ok(InstalledCli {
                                path: "/cli".into(),
                                version: "0.2.728".into(),
                                warning: None,
                            })
                        }
                    })
                }));
            }
            for worker in workers {
                assert_eq!(worker.join().unwrap().is_err(), failure);
            }
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}

#[test]
fn untrusted_versions_cannot_be_flags_or_shell_fragments() {
    for bad in [
        "",
        "latest",
        "--help",
        "0.2.728;touch /tmp/no",
        "$(id)",
        "0.2.728\n",
        "1.2",
        "1.2.3.4",
        "1.2.-3",
        "1.2.99999999999999999999999999999",
    ] {
        assert!(Version::parse(bad).is_err(), "accepted {bad:?}");
    }
}

#[test]
fn relative_home_is_rejected_before_installation() {
    let mut fake = Fake::new(None);
    assert!(ensure_with(Path::new("relative"), &mut fake).is_err());
    assert_eq!(fake.installs, 0);
}

#[test]
fn native_subprocesses_receive_only_allowlisted_environment() {
    let scratch = Scratch::new().unwrap();
    let native = NativeInstaller {
        home: Path::new("/tmp"),
        scratch,
    };
    let output = native
        .run(
            native.command("/usr/bin/env"),
            Duration::from_secs(2),
            "environment test",
        )
        .unwrap();
    let mut keys: Vec<_> = std::str::from_utf8(&output)
        .unwrap()
        .lines()
        .map(|s| s.split_once('=').unwrap().0)
        .collect();
    keys.sort();
    assert_eq!(keys, ["CURL_HOME", "HOME", "LC_ALL", "PATH", "TMPDIR"]);
}

#[test]
fn native_timeout_is_bounded_and_failure_does_not_expose_stderr() {
    let native = NativeInstaller {
        home: Path::new("/tmp"),
        scratch: Scratch::new().unwrap(),
    };
    let mut cmd = native.command("/bin/bash");
    cmd.args(["-c", "sleep 10 & wait"]);
    let start = Instant::now();
    assert!(native
        .run(cmd, Duration::from_millis(100), "test")
        .unwrap_err()
        .contains("timed out"));
    assert!(start.elapsed() < Duration::from_secs(3));
    let mut cmd = native.command("/bin/bash");
    cmd.args(["-c", "echo synthetic-sensitive-output >&2; exit 7"]);
    let error = native.run(cmd, Duration::from_secs(2), "test").unwrap_err();
    assert!(error.contains("failed"));
    assert!(!error.contains("synthetic-sensitive-output"));
}

#[test]
fn scratch_directory_is_private_and_removed() {
    use std::os::unix::fs::PermissionsExt;
    let path = {
        let scratch = Scratch::new().unwrap();
        assert_eq!(
            fs::metadata(&scratch.0).unwrap().permissions().mode() & 0o777,
            0o700
        );
        scratch.0.clone()
    };
    assert!(!path.exists());
}

#[test]
fn download_uses_fixed_https_endpoints_without_redirects_or_curl_config() {
    let native = NativeInstaller {
        home: Path::new("/tmp"),
        scratch: Scratch::new().unwrap(),
    };
    for url in [MANIFEST_URL, INSTALL_URL] {
        let cmd = native.download_command(url);
        assert_eq!(cmd.get_program(), "/usr/bin/curl");
        let args: Vec<_> = cmd.get_args().collect();
        assert_eq!(args[0], "--disable");
        assert_eq!(args.last().unwrap(), &url);
        assert!(args.windows(2).any(|a| a == ["--proto", "=https"]));
        assert!(!args
            .iter()
            .any(|a| *a == "-L" || *a == "--location" || *a == "--insecure"));
    }
}

#[test]
fn installer_arguments_cannot_inject_commands_or_start_sign_in() {
    let native = NativeInstaller {
        home: Path::new("/tmp"),
        scratch: Scratch::new().unwrap(),
    };
    let cmd = native.install_command(
        Path::new("/private/install.sh"),
        Path::new("/home/has spaces;$(id)/bin"),
        &v("0.2.728"),
    );
    assert_eq!(cmd.get_program(), "/bin/bash");
    let args: Vec<_> = cmd.get_args().collect();
    assert_eq!(
        args,
        [
            "/private/install.sh",
            "--version",
            "0.2.728",
            "--install-dir",
            "/home/has spaces;$(id)/bin",
            "--background-mode",
            "cli_only",
            "--no-modify-path",
            "--no-login",
            "--minimal"
        ]
    );
}

#[test]
fn native_version_probe_executes_the_exact_path_without_a_shell() {
    let mut native = NativeInstaller {
        home: Path::new("/tmp"),
        scratch: Scratch::new().unwrap(),
    };
    let cli = native.scratch.0.join("reason ; not-a-command");
    super::super::test_exe::write_executable(
        &cli,
        "#!/bin/sh\n[ \"$1\" = --version ] || exit 1\nprintf 'reason 0.2.728\\n'\n",
        0o755,
    );
    assert_eq!(native.version(&cli).unwrap(), v("0.2.728"));
}

#[test]
fn ipc_is_registered_and_does_not_change_user_override_settings() {
    let root = std::env::var_os("REASON_ACP_REPO_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
    let lib = fs::read_to_string(root.join("src-tauri/src/lib.rs")).unwrap();
    let chat = fs::read_to_string(root.join("src-tauri/src/reason_chat.rs")).unwrap();
    assert!(lib.contains("reason_chat::reason_cli_ensure_current,"));
    assert!(chat.contains("Some(p) if !p.is_empty() => PathBuf::from(p),"));
    let handler = chat
        .split("pub async fn reason_cli_ensure_current()")
        .nth(1)
        .unwrap()
        .split("/// Runs `f`")
        .next()
        .unwrap();
    assert!(handler.contains("spawn_blocking"));
    assert!(!handler.contains("SettingsService"));
    assert!(!handler.contains("login"));
}

#[test]
fn failed_steps_report_their_exit_code() {
    assert_eq!(failure_message("download", Some(22)), "Reason download failed (curl 22: server returned an HTTP error). Check your connection and available disk space, then retry.");
    assert!(failure_message("download", Some(6)).contains("curl 6: could not resolve host"));
    assert!(failure_message("download", Some(92)).contains("(curl exit 92)"));
    assert!(failure_message("install", Some(1)).contains("Reason install failed (exit 1)."));
    assert!(failure_message("install", None).contains("stopped by a signal"));
}
